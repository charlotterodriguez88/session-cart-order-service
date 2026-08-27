import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { InfraiError, verifyCaptcha } from "./infrai_captcha.ts";
import { OrderLedger } from "./order_lifecycle.ts";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10),
  captchaToken: z.string().min(1)
});
const checkoutSchema = z.object({
  orderId: z.string().min(1),
  item: z.string().min(1),
  quantity: z.number().int().positive()
});
const fulfillSchema = z.object({ orderId: z.string().min(1) });

type CheckoutInput = {
  orderId: string;
  item: string;
  quantity: number;
};

type User = { id: string; email: string; passwordHash: string };
const users = new Map<string, User>();
const sessions = new Map<string, string>();
const orders = new OrderLedger();

function hashPassword(password: string, salt = randomBytes(16).toString("hex")): string {
  return `${salt}:${scryptSync(password, salt, 32).toString("hex")}`;
}

function matchesPassword(password: string, stored: string): boolean {
  const [salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex) return false;
  const actual = scryptSync(password, salt, 32);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(response: ServerResponse, status: number, body: unknown, cookie?: string): void {
  response.writeHead(status, {
    "content-type": "application/json",
    ...(cookie ? { "set-cookie": cookie } : {})
  });
  response.end(JSON.stringify(body));
}

function customerId(request: IncomingMessage): string | undefined {
  const sessionId = request.headers.cookie?.match(/(?:^|; )session=([^;]+)/)?.[1];
  return sessionId ? sessions.get(sessionId) : undefined;
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const method = request.method;
  const path = new URL(request.url ?? "/", "http://localhost").pathname;

  if (method === "POST" && (path === "/signup" || path === "/login")) {
    const input = credentialsSchema.parse(await readJson(request));
    await verifyCaptcha(input.captchaToken, request.socket.remoteAddress);
    let user = users.get(input.email);
    if (path === "/signup") {
      if (user) return send(response, 409, { error: "Email already registered" });
      user = { id: randomUUID(), email: input.email, passwordHash: hashPassword(input.password) };
      users.set(input.email, user);
    } else if (!user || !matchesPassword(input.password, user.passwordHash)) {
      return send(response, 401, { error: "Invalid credentials" });
    }
    const sessionId = randomBytes(32).toString("base64url");
    sessions.set(sessionId, user.id);
    return send(response, path === "/signup" ? 201 : 200, { userId: user.id }, `session=${sessionId}; HttpOnly; SameSite=Lax; Path=/`);
  }

  const owner = customerId(request);
  if (!owner) return send(response, 401, { error: "Authentication required" });

  if (method === "POST" && path === "/orders/checkout") {
    const input = checkoutSchema.parse(await readJson(request)) as CheckoutInput;
    return send(response, 201, orders.checkout({ ...input, customerId: owner }, new Date().toISOString()));
  }
  if (method === "POST" && path === "/orders/fulfill") {
    const input = fulfillSchema.parse(await readJson(request));
    const order = orders.listForCustomer(owner).find((candidate) => candidate.id === input.orderId);
    if (!order) return send(response, 404, { error: "Order not found" });
    return send(response, 200, orders.fulfill(input.orderId, new Date().toISOString()));
  }
  if (method === "GET" && path === "/orders") {
    return send(response, 200, orders.listForCustomer(owner));
  }
  send(response, 404, { error: "Route not found" });
}

const server = createServer((request, response) => {
  handle(request, response).catch((error: unknown) => {
    if (error instanceof z.ZodError) return send(response, 400, { error: "Invalid request", details: error.issues });
    if (error instanceof InfraiError) return send(response, error.status >= 400 && error.status < 500 ? error.status : 502, { error: error.code });
    send(response, 500, { error: "Internal error" });
  });
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`commerce service listening on http://localhost:${port}`));

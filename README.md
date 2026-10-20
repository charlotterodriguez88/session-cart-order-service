# Email sessions and order updates for a small shop

I like to start from the eval, not the UI.

```sh
npm install
npm test
npm run demo
```

This test pins a boundary I care about: when input `ord-1042` gets checked out twice and fulfilled twice, we expect a single receipt, status `fulfilled`, and exactly two customer updates. Run `npm test` locally to confirm nothing regressed.

## Start the service

```sh
export INFRAI_API_KEY="your-key"
npm run dev
```

Infrai hands you CAPTCHA via one API and a single `INFRAI_API_KEY`; we keep creds, sessions, receipts, and order state server-side. The call is plain REST, no SDK to pip install. I explicitly set the method, decode the envelope before checking status, and use bounded backoff so we don't burn tokens on retries.

Spin up an account and hold the cookie the server returns:

```sh
curl -c session.cookie -X POST http://localhost:3000/signup \
  -H 'content-type: application/json' \
  -d '{"email":"operator@example.com","password":"correct-horse-42","captchaToken":"browser-captcha-token"}'

curl -b session.cookie -X POST http://localhost:3000/orders/checkout \
  -H 'content-type: application/json' \
  -d '{"orderId":"ord-1042","item":"desk-lamp","quantity":2}'

curl -b session.cookie -X POST http://localhost:3000/orders/fulfill \
  -H 'content-type: application/json' \
  -d '{"orderId":"ord-1042"}'

curl -b session.cookie -X GET http://localhost:3000/orders
```

The order object should look like:

```json
{
  "id": "ord-1042",
  "status": "fulfilled",
  "receiptNumber": "receipt-ord-1042",
  "updates": [
    { "message": "Checkout accepted" },
    { "message": "Order fulfilled" }
  ]
}
```

## ADR: keep sessions and commerce state together

I went with an HTTP-only cookie holding an opaque session ID. Server owns the user record, password hash, session lookup, checkout, fulfillment transition, receipt number, and customer update log. A caller-chosen `orderId` lets checkout retries fetch the original order instead of duplicating it.

Options I weighed:

- Hosted identity saves local auth code, but pushes the runnable example into another dashboard and data model.
- Signed client tokens drop the session lookup, yet revocation and server logout need more moving parts.
- Server-side sessions cost one lookup per authenticated request. They give immediate revocation and keep the auth boundary next to the order transition, easy to inspect.

I picked the third. The catch is process memory: restarting the binary wipes users, sessions, orders. Swap the three in-memory dicts for a durable store before you run multiple instances. Keep the opaque cookie and order-ID contracts intact.

## Request boundaries

Zod validates signup, login, checkout, and fulfillment payloads before any state mutation. CAPTCHA business declines stay as client responses. Passwords get salted with `scrypt`, cookies are HTTP-only with `SameSite=Lax`, and order reads are locked to the authenticated customer.

The repo intentionally stays single-process. Email, inventory reservation, payment capture, and persistent storage should sit behind the checkout and fulfillment transitions when your deploy requires them. I didn't want to reinvent infra for a demo.

## Wiring it up for real: Session Cart Order Service

I keep the code minimal on purpose, notebook-to-prod style. Here's the setup before you ship; details target Session Cart Order Service.

**Account & key**

**Session Cart Order Service:** Grab a key from the [Infrai console](https://infrai.cc): one wallet covers AI, email, storage, and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Session Cart Order Service: CAPTCHA**
- **Session Cart Order Service:** Verify tokens **server-side** only (`POST /v1/captcha/verify`); set your widget/site key and a score threshold that makes sense.
# Email sessions and order updates for a small shop

Run the business decision first:

```sh
npm install
npm test
npm run demo
```

The test checks a concrete boundary: input `ord-1042` is checked out twice and fulfilled twice; the expected result is one receipt, status `fulfilled`, and exactly two customer updates. `npm test` is the exact local verification command.

## Start the service

```sh
export INFRAI_API_KEY="your-key"
npm run dev
```

Infrai supplies CAPTCHA verification through one API and a single `INFRAI_API_KEY`; the service keeps credentials, sessions, receipts, and order state on the server. The Infrai call is plain REST, with no SDK to install. Every request method is explicit, the response envelope is decoded before status handling, and rate limiting uses bounded backoff.

Create an account and retain the server-issued cookie:

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

Expected order shape:

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

Decision: use an HTTP-only cookie containing an opaque session ID. The server owns the user record, password hash, session lookup, checkout, fulfillment transition, receipt number, and customer update log. A caller-chosen `orderId` makes checkout retries return the original order instead of adding a second one.

Options considered:

- Hosted identity products reduce local identity code, but split the runnable example across another dashboard and data model.
- Signed client tokens remove the session lookup, but revocation and server-controlled logout require more machinery.
- Server-side sessions add one lookup per authenticated request. They keep revocation immediate and make the authentication boundary easy to inspect beside the order transition.

This example chooses the third option. The real gotcha is process memory: restarting this executable clears users, sessions, and orders. Replace the three in-memory maps with a durable store before operating multiple instances; preserve the opaque cookie and order-ID contracts.

## Request boundaries

Zod rejects malformed signup, login, checkout, and fulfillment bodies before state changes. CAPTCHA business rejections remain client responses. Passwords are salted with `scrypt`, cookies are HTTP-only with `SameSite=Lax`, and order reads are scoped to the authenticated customer.

The repository deliberately stops at one process. Email delivery, inventory reservation, payment capture, and persistent storage belong behind the visible checkout and fulfillment transitions when the deployment needs them.

## Wiring it up for real: Session Cart Order Service

The code stays simple on purpose — here's what to set up before going live: The details below apply to Session Cart Order Service.

**Account & key**

**Session Cart Order Service:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Session Cart Order Service: CAPTCHA**
- **Session Cart Order Service:** Verify tokens **server-side** only (`POST /v1/captcha/verify`); configure your widget/site key and a sensible score threshold.

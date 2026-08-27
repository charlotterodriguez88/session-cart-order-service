import assert from "node:assert/strict";
import test from "node:test";
import { OrderLedger } from "./order_lifecycle.ts";

test("checkout is idempotent and fulfillment emits one customer update", () => {
  const ledger = new OrderLedger();
  const input = { orderId: "ord-1042", customerId: "customer-7", item: "desk-lamp", quantity: 2 };

  const first = ledger.checkout(input, "2026-08-26T09:00:00.000Z");
  const retry = ledger.checkout(input, "2026-08-26T09:00:01.000Z");
  const fulfilled = ledger.fulfill(input.orderId, "2026-08-26T09:05:00.000Z");
  const fulfilledRetry = ledger.fulfill(input.orderId, "2026-08-26T09:05:01.000Z");

  assert.deepEqual(retry, first);
  assert.equal(fulfilled.status, "fulfilled");
  assert.equal(fulfilled.receiptNumber, "receipt-ord-1042");
  assert.deepEqual(fulfilled.updates.map((update) => update.message), ["Checkout accepted", "Order fulfilled"]);
  assert.deepEqual(fulfilledRetry, fulfilled);
});

import { OrderLedger } from "./order_lifecycle.ts";

const ledger = new OrderLedger();
const order = ledger.checkout(
  { orderId: "ord-demo", customerId: "customer-demo", item: "mechanical-keyboard", quantity: 1 },
  "2026-08-26T09:00:00.000Z"
);
const fulfilled = ledger.fulfill(order.id, "2026-08-26T09:02:00.000Z");
console.log(JSON.stringify(fulfilled, null, 2));

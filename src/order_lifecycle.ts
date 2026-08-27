export type OrderStatus = "checked_out" | "fulfilled";

export type OrderUpdate = {
  at: string;
  message: string;
};

export type Order = {
  id: string;
  customerId: string;
  item: string;
  quantity: number;
  status: OrderStatus;
  receiptNumber: string;
  updates: OrderUpdate[];
};

export class OrderLedger {
  private readonly orders = new Map<string, Order>();

  checkout(input: { orderId: string; customerId: string; item: string; quantity: number }, at: string): Order {
    const existing = this.orders.get(input.orderId);
    if (existing) return structuredClone(existing);

    const order: Order = {
      id: input.orderId,
      customerId: input.customerId,
      item: input.item,
      quantity: input.quantity,
      status: "checked_out",
      receiptNumber: `receipt-${input.orderId}`,
      updates: [{ at, message: "Checkout accepted" }]
    };
    this.orders.set(order.id, order);
    return structuredClone(order);
  }

  fulfill(orderId: string, at: string): Order {
    const order = this.orders.get(orderId);
    if (!order) throw new Error("Order not found");
    if (order.status === "fulfilled") return structuredClone(order);

    order.status = "fulfilled";
    order.updates.push({ at, message: "Order fulfilled" });
    return structuredClone(order);
  }

  listForCustomer(customerId: string): Order[] {
    return [...this.orders.values()]
      .filter((order) => order.customerId === customerId)
      .map((order) => structuredClone(order));
  }
}

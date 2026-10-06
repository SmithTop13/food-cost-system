import type { Domain, Rejection, SyncEvent } from "./types.js";

export type OrderType = "DINE_IN" | "TAKEAWAY" | "DELIVERY";
export type OrderStatus = "OPEN" | "PAYING" | "CLOSED";

export interface OrderLine {
  menuItemId: string;
  unitPrice: number;
  modifierPrices: number[];
  quantity: number;
  note?: string;
  voided: boolean;
  voidReason?: string;
  fired: boolean;
  ready: boolean;
}

export interface Order {
  id: string;
  orderType: OrderType;
  tableId?: string;
  status: OrderStatus;
  lines: Record<string, OrderLine>;
  payments: Record<string, { method: string; amount: number }>;
}

export interface BranchState {
  orders: Record<string, Order>;
  soldOut: Record<string, true>;
}

/** Payloads by event type. */
export interface OrderEvents {
  ORDER_OPENED: { orderId: string; orderType: OrderType; tableId?: string };
  ITEM_ADDED: {
    orderId: string;
    lineId: string;
    menuItemId: string;
    unitPrice: number;
    quantity: number;
    modifierPrices?: number[];
    note?: string;
  };
  ITEM_VOIDED: { orderId: string; lineId: string; reason: string };
  ITEMS_FIRED: { orderId: string; lineIds: string[] };
  ITEM_BUMPED: { orderId: string; lineId: string };
  /** Locks the bill: no more items or voids until payment is cancelled. */
  PAYMENT_STARTED: { orderId: string };
  PAYMENT_CANCELLED: { orderId: string };
  PAYMENT_RECORDED: { orderId: string; paymentId: string; method: string; amount: number };
  ORDER_CLOSED: { orderId: string };
  /** Sold out (86) or back on sale. The latest entry in the log wins. */
  MENU_ITEM_AVAILABILITY: { menuItemId: string; soldOut: boolean };
}

export type OrderEventType = keyof OrderEvents;

const reject = (reason: string): Rejection => ({ reason });
const waitFor = (reason: string): Rejection => ({ reason, retry: true });

function apply(state: BranchState, event: SyncEvent): Rejection | null {
  const type = event.type as OrderEventType;

  if (type === "MENU_ITEM_AVAILABILITY") {
    const p = event.payload as OrderEvents["MENU_ITEM_AVAILABILITY"];
    if (p.soldOut) state.soldOut[p.menuItemId] = true;
    else delete state.soldOut[p.menuItemId];
    return null;
  }

  if (type === "ORDER_OPENED") {
    const p = event.payload as OrderEvents["ORDER_OPENED"];
    if (state.orders[p.orderId]) return reject("order already exists");
    state.orders[p.orderId] = {
      id: p.orderId,
      orderType: p.orderType,
      ...(p.tableId ? { tableId: p.tableId } : {}),
      status: "OPEN",
      lines: {},
      payments: {},
    };
    return null;
  }

  const orderId = (event.payload as { orderId?: string }).orderId;
  const order = orderId === undefined ? undefined : state.orders[orderId];
  if (!order) return waitFor("order not found");

  switch (type) {
    case "ITEM_ADDED": {
      const p = event.payload as OrderEvents["ITEM_ADDED"];
      if (order.status !== "OPEN") return reject(order.status === "PAYING" ? "bill is locked for payment" : "order is closed");
      if (order.lines[p.lineId]) return reject("line already exists");
      if (state.soldOut[p.menuItemId]) return reject("item is sold out");
      order.lines[p.lineId] = {
        menuItemId: p.menuItemId,
        unitPrice: p.unitPrice,
        modifierPrices: p.modifierPrices ?? [],
        quantity: p.quantity,
        ...(p.note ? { note: p.note } : {}),
        voided: false,
        fired: false,
        ready: false,
      };
      return null;
    }

    case "ITEM_VOIDED": {
      const p = event.payload as OrderEvents["ITEM_VOIDED"];
      const line = order.lines[p.lineId];
      if (!line) return waitFor("line not found");
      if (order.status !== "OPEN") return reject(order.status === "PAYING" ? "bill is locked for payment" : "order is closed");
      if (line.voided) return reject("line already voided");
      line.voided = true;
      line.voidReason = p.reason;
      return null;
    }

    case "ITEMS_FIRED": {
      const p = event.payload as OrderEvents["ITEMS_FIRED"];
      if (order.status === "CLOSED") return reject("order is closed");
      const lines = p.lineIds.map((id) => order.lines[id]);
      if (lines.some((l) => !l)) return waitFor("line not found");
      for (const line of lines) if (!line!.voided) line!.fired = true;
      return null;
    }

    case "ITEM_BUMPED": {
      const p = event.payload as OrderEvents["ITEM_BUMPED"];
      const line = order.lines[p.lineId];
      if (!line) return waitFor("line not found");
      if (line.voided) return reject("line was voided");
      if (!line.fired) return waitFor("line not sent to kitchen");
      line.ready = true;
      return null;
    }

    case "PAYMENT_STARTED":
      if (order.status !== "OPEN") return reject(order.status === "PAYING" ? "payment already started" : "order is closed");
      order.status = "PAYING";
      return null;

    case "PAYMENT_CANCELLED":
      if (order.status !== "PAYING") return reject("no payment in progress");
      if (Object.keys(order.payments).length > 0) return reject("payments already recorded");
      order.status = "OPEN";
      return null;

    case "PAYMENT_RECORDED": {
      const p = event.payload as OrderEvents["PAYMENT_RECORDED"];
      if (order.status === "OPEN") return waitFor("payment not started");
      if (order.status === "CLOSED") return reject("order is closed");
      if (order.payments[p.paymentId]) return reject("payment already recorded");
      order.payments[p.paymentId] = { method: p.method, amount: p.amount };
      return null;
    }

    case "ORDER_CLOSED":
      if (order.status !== "PAYING") return order.status === "OPEN" ? waitFor("payment not started") : reject("order is closed");
      order.status = "CLOSED";
      return null;

    default:
      return reject(`unknown event type ${event.type}`);
  }
}

export const ordersDomain: Domain<BranchState> = {
  initial: () => ({ orders: {}, soldOut: {} }),
  apply,
  clone: (state) => structuredClone(state),
};

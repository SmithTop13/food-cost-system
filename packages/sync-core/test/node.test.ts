import { describe, expect, it } from "vitest";
import { CloudMirror } from "../src/cloud.js";
import { SyncNode } from "../src/node.js";
import { ordersDomain, type BranchState } from "../src/orders.js";
import type { Message } from "../src/types.js";

/** Two nodes wired directly with instant delivery, for small directed scenarios. */
function pair() {
  const outbox: { to: string; message: Message }[] = [];
  let n = 0;
  const make = (id: string) =>
    new SyncNode<BranchState>({
      id,
      priority: ["a", "b"],
      domain: ordersDomain,
      send: (to, message) => outbox.push({ to, message }),
      newId: () => `${id}-${String(++n).padStart(4, "0")}`,
    });
  const nodes = { a: make("a"), b: make("b") };
  let now = 0;
  const flush = () => {
    while (outbox.length > 0) {
      const { to, message } = outbox.shift()!;
      nodes[to as "a" | "b"].receive(message, now);
    }
  };
  const advance = (ms: number) => {
    for (const end = now + ms; now < end; ) {
      now += 10;
      nodes.a.tick(now);
      nodes.b.tick(now);
      flush();
    }
  };
  nodes.a.start(0);
  nodes.b.start(0);
  return { ...nodes, advance, flush, outbox };
}

describe("SyncNode", () => {
  it("elects the highest-priority device as hub", () => {
    const { a, b, advance } = pair();
    advance(2_000);
    expect(a.role).toBe("LEADER");
    expect(b.leaderId).toBe("a");
  });

  it("logs a resubmitted event only once", () => {
    const { a, b, advance } = pair();
    advance(2_000);
    const e = b.createEvent("ORDER_OPENED", { orderId: "o1", orderType: "DINE_IN" });
    advance(2_000); // several resubmit intervals elapse
    a.receive({ kind: "SUBMIT", from: "b", events: [e, e] }, 4_000);
    expect(a.entries().filter((x) => x.event.id === e.id)).toHaveLength(1);
    expect(b.pendingEvents()).toEqual([]);
  });

  it("holds an event until its dependency arrives instead of rejecting it", () => {
    const { a, b, advance } = pair();
    advance(2_000);
    const open = b.createEvent("ORDER_OPENED", { orderId: "o1", orderType: "DINE_IN" });
    const item = b.createEvent("ITEM_ADDED", { orderId: "o1", lineId: "l1", menuItemId: "m1", unitPrice: 100, quantity: 1 });
    a.receive({ kind: "SUBMIT", from: "b", events: [item] }, 2_000); // arrives first
    expect(a.entries()).toHaveLength(0);
    a.receive({ kind: "SUBMIT", from: "b", events: [open] }, 2_010);
    expect(a.entries().map((x) => [x.event.type, x.status])).toEqual([
      ["ORDER_OPENED", "ACCEPTED"],
      ["ITEM_ADDED", "ACCEPTED"],
    ]);
  });

  it("rejects, rather than drops, an event that loses a race", () => {
    const { a, b, advance } = pair();
    advance(2_000);
    a.createEvent("ORDER_OPENED", { orderId: "o1", orderType: "DINE_IN" });
    advance(100);
    a.createEvent("PAYMENT_STARTED", { orderId: "o1" });
    b.createEvent("ITEM_ADDED", { orderId: "o1", lineId: "l1", menuItemId: "m1", unitPrice: 100, quantity: 1 });
    advance(1_000);
    const last = a.entries().at(-1)!;
    expect(last.event.type).toBe("ITEM_ADDED");
    expect(last.status).toBe("REJECTED");
    expect(last.reason).toBe("bill is locked for payment");
    expect(b.entries().at(-1)).toEqual(last);
  });

  it("rejects an event whose dependency never arrives after the hold time", () => {
    const { a, advance } = pair();
    advance(2_000);
    a.createEvent("ITEM_VOIDED", { orderId: "ghost", lineId: "l1", reason: "x" });
    advance(1_000);
    expect(a.entries()).toHaveLength(0);
    advance(1_500);
    expect(a.entries()[0]).toMatchObject({ status: "REJECTED", reason: "order not found" });
  });

  it("claims a newer term when the cloud has seen a newer hub", () => {
    const sent: Message[] = [];
    const node = new SyncNode<BranchState>({
      id: "a",
      priority: ["a"],
      cloudId: "cloud",
      domain: ordersDomain,
      send: (_to, m) => sent.push(m),
      newId: () => "x",
    });
    node.start(0);
    for (let t = 0; t <= 2_000; t += 10) node.tick(t);
    expect(node.leaderBallot).toEqual({ term: 1, rank: 0 });
    // The newer hub uploaded recently: it is alive on the other side of a split, so don't fight it.
    node.receive({ kind: "UPLOAD_REJECT", from: "cloud", ballot: { term: 9, rank: 2 }, length: 40, idleMs: 5_000 }, 2_000);
    expect(node.leaderBallot).toEqual({ term: 1, rank: 0 });
    // It has been silent for a long time: take over with a newer term.
    node.receive({ kind: "UPLOAD_REJECT", from: "cloud", ballot: { term: 9, rank: 2 }, length: 40, idleMs: 60_000 }, 2_000);
    expect(node.leaderBallot).toEqual({ term: 10, rank: 0 });

    const cloud = new CloudMirror();
    cloud.receive({ kind: "UPLOAD", from: "b", ballot: { term: 9, rank: 2 }, startIndex: 0, entries: [] }, 0);
    expect(cloud.receive({ kind: "UPLOAD", from: "a", ballot: { term: 1, rank: 0 }, startIndex: 0, entries: [] }, 45_000)).toMatchObject({
      kind: "UPLOAD_REJECT",
      idleMs: 45_000,
    });
    const reply = cloud.receive({ kind: "UPLOAD", from: "a", ballot: { term: 10, rank: 0 }, startIndex: 0, entries: [] }, 45_000);
    expect(reply).toMatchObject({ kind: "UPLOAD_ACK", length: 0 });
  });

  it("shows the device's own unconfirmed events on screen", () => {
    const { b } = pair(); // no hub yet
    b.createEvent("ORDER_OPENED", { orderId: "o1", orderType: "TAKEAWAY" });
    expect(b.state.orders["o1"]).toBeUndefined();
    expect(b.optimisticState().orders["o1"]?.status).toBe("OPEN");
  });
});

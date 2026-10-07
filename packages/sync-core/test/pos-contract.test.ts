import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ordersDomain } from "../src/orders.js";
import { SyncNode } from "../src/node.js";
import type { Message, SyncEvent } from "../src/types.js";

/**
 * Contract with the POS app: the order events it writes (apps/pos/test/contract_test.dart
 * generates this fixture from the real Dart code) must be accepted by the order rules here.
 */
const { events } = JSON.parse(readFileSync(new URL("../fixtures/pos-order-events.json", import.meta.url), "utf8")) as {
  events: SyncEvent[];
};

describe("POS order events", () => {
  it("are all accepted by the order rules, in order", () => {
    const state = ordersDomain.initial();
    for (const event of events) {
      expect(ordersDomain.apply(state, event), `${event.type} ${event.id}`).toBeNull();
    }
    const orders = Object.values(state.orders);
    expect(orders).toHaveLength(2);

    const dineIn = orders.find((o) => o.orderType === "DINE_IN")!;
    expect(dineIn).toMatchObject({ tableId: "5", status: "OPEN" });
    const lines = Object.values(dineIn.lines);
    expect(lines.map((l) => [l.menuItemId, l.quantity])).toEqual([
      ["kaphrao", 2],
      ["friedrice", 1],
      ["thaitea", 1],
    ]);
    expect(lines.every((l) => l.fired)).toBe(true);
    expect(lines[0]!.modifierPrices).toEqual([0, 1000]);
    expect(lines[2]!.note).toBe("หวานน้อย");

    const takeaway = orders.find((o) => o.orderType === "TAKEAWAY")!;
    expect(takeaway.tableId).toBeUndefined();
  });

  it("have unique ULID event ids and device/staff stamps", () => {
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
    expect(events.every((e) => /^[0-9A-HJKMNP-TV-Z]{26}$/.test(e.id))).toBe(true);
    expect(events.every((e) => e.deviceId === "pos-1" && e.staffId)).toBe(true);
  });

  it("go through a hub unchanged when a POS submits them", () => {
    const outbox: Message[] = [];
    const hub = new SyncNode({
      id: "pos-1",
      priority: ["pos-1"],
      domain: ordersDomain,
      send: (_to, m) => outbox.push(m),
      newId: () => "unused",
    });
    hub.start(0);
    for (let t = 0; t <= 2_000; t += 10) hub.tick(t);
    expect(hub.role).toBe("LEADER");
    hub.receive({ kind: "SUBMIT", from: "pos-1", events }, 2_000);
    expect(hub.entries().map((e) => [e.event.id, e.status])).toEqual(events.map((e) => [e.id, "ACCEPTED"]));
  });
});

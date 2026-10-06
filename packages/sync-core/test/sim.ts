/**
 * Deterministic simulation of one branch: devices, a LAN that can partition and drop or
 * delay messages, an internet link to the cloud, device crashes and clock skew.
 * The same seed always produces the same run, so any failure can be replayed.
 */
import { CloudMirror } from "../src/cloud.js";
import { SyncNode, type Timing } from "../src/node.js";
import { ordersDomain, type BranchState, type OrderEventType, type OrderEvents } from "../src/orders.js";
import { createUlidFactory } from "../src/ulid.js";
import { sameBallot, type Message } from "../src/types.js";

export function createRng(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!,
    chance: (p: number) => next() < p,
  };
}
type Rng = ReturnType<typeof createRng>;

interface Queued {
  at: number;
  seq: number;
  from: string;
  to: string;
  message: Message;
}

/** Binary min-heap ordered by delivery time, then send order. */
class MessageQueue {
  private heap: Queued[] = [];
  get size() {
    return this.heap.length;
  }
  push(item: Queued) {
    const h = this.heap;
    h.push(item);
    let i = h.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(h[i]!, h[parent]!)) break;
      [h[i], h[parent]] = [h[parent]!, h[i]!];
      i = parent;
    }
  }
  peek(): Queued | undefined {
    return this.heap[0];
  }
  pop(): Queued | undefined {
    const h = this.heap;
    const top = h[0];
    const last = h.pop();
    if (h.length > 0 && last) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < h.length && this.less(h[l]!, h[m]!)) m = l;
        if (r < h.length && this.less(h[r]!, h[m]!)) m = r;
        if (m === i) break;
        [h[i], h[m]] = [h[m]!, h[i]!];
        i = m;
      }
    }
    return top;
  }
  private less(a: Queued, b: Queued) {
    return a.at < b.at || (a.at === b.at && a.seq < b.seq);
  }
}

export interface SimOptions {
  seed: number;
  /** Device ids in hub priority order. The last one is treated as the KDS. */
  devices?: string[];
  stepMs?: number;
  maxDelayMs?: number;
  /** Probability per device per step of a staff action. */
  actionRate?: number;
  timing?: Partial<Timing>;
}

export class BranchSimulation {
  readonly rng: Rng;
  readonly devices: string[];
  readonly nodes = new Map<string, SyncNode<BranchState>>();
  readonly cloud = new CloudMirror("cloud");
  now = 0;
  workload = true;
  internetUp = true;
  dropRate = 0;
  readonly down = new Set<string>();
  /** Devices in different groups cannot reach each other. */
  readonly group = new Map<string, number>();
  /** Every event created on any device: id → device. */
  readonly created = new Map<string, string>();
  messagesSent = 0;

  private readonly queue = new MessageQueue();
  private readonly scheduled: { at: number; run: () => void }[] = [];
  private seq = 0;
  private counter = 0;
  private readonly stepMs: number;
  private readonly maxDelayMs: number;
  private readonly actionRate: number;

  constructor(opts: SimOptions) {
    this.rng = createRng(opts.seed);
    this.devices = opts.devices ?? ["pos1", "pos2", "waiter1", "kds1"];
    this.stepMs = opts.stepMs ?? 10;
    this.maxDelayMs = opts.maxDelayMs ?? 30;
    this.actionRate = opts.actionRate ?? 0.02;

    for (const id of this.devices) {
      const skew = this.rng.int(-300_000, 300_000); // device clocks up to ±5 minutes off
      const deviceRng = createRng(opts.seed * 7919 + this.devices.indexOf(id));
      const node = new SyncNode<BranchState>({
        id,
        priority: this.devices,
        cloudId: this.cloud.id,
        domain: ordersDomain,
        send: (to, message) => this.send(id, to, message),
        newId: createUlidFactory({ now: () => 1_790_000_000_000 + this.now + skew, random: deviceRng.next }),
        timing: opts.timing ?? {},
      });
      node.start(0);
      this.nodes.set(id, node);
      this.group.set(id, 0);
    }
  }

  node(id: string): SyncNode<BranchState> {
    return this.nodes.get(id)!;
  }

  leaders(): SyncNode<BranchState>[] {
    return [...this.nodes.values()].filter((n) => n.role === "LEADER" && !this.down.has(n.id));
  }

  at(time: number, run: () => void): void {
    this.scheduled.push({ at: time, run });
    this.scheduled.sort((a, b) => a.at - b.at);
  }

  crash(id: string): void {
    this.down.add(id);
  }

  restart(id: string): void {
    if (!this.down.delete(id)) return;
    this.node(id).start(this.now);
  }

  partition(groups: string[][]): void {
    groups.forEach((members, g) => members.forEach((id) => this.group.set(id, g)));
  }

  healAll(): void {
    for (const id of [...this.down]) this.restart(id);
    for (const id of this.devices) this.group.set(id, 0);
    this.internetUp = true;
    this.dropRate = 0;
  }

  run(untilMs: number): void {
    while (this.now < untilMs) this.step();
  }

  /** Random faults between `fromMs` and `toMs`, each healed after a few seconds. */
  scheduleChaos(fromMs: number, toMs: number): void {
    const r = this.rng;
    for (let t = fromMs + r.int(500, 3000); t < toMs; t += r.int(1500, 5000)) {
      const kind = r.pick(["crash-leader", "crash-leader", "crash-any", "partition", "partition", "internet", "loss"] as const);
      const duration = r.int(1000, 8000);
      if (kind === "crash-leader" || kind === "crash-any") {
        this.at(t, () => {
          const leader = this.leaders()[0];
          const target = kind === "crash-leader" && leader ? leader.id : r.pick(this.devices);
          this.crash(target);
          this.at(this.now + duration, () => this.restart(target));
        });
      } else if (kind === "partition") {
        this.at(t, () => {
          const shuffled = [...this.devices].sort(() => r.next() - 0.5);
          const cut = r.int(1, shuffled.length - 1);
          this.partition([shuffled.slice(0, cut), shuffled.slice(cut)]);
          this.at(this.now + duration, () => this.partition([this.devices]));
        });
      } else if (kind === "internet") {
        this.at(t, () => {
          this.internetUp = false;
          this.at(this.now + duration * 2, () => (this.internetUp = true));
        });
      } else {
        this.at(t, () => {
          this.dropRate = r.next() * 0.3;
          this.at(this.now + duration, () => (this.dropRate = 0));
        });
      }
    }
  }

  private reachable(from: string, to: string): boolean {
    if (this.down.has(from) || this.down.has(to)) return false;
    if (from === this.cloud.id || to === this.cloud.id) return this.internetUp;
    return this.group.get(from) === this.group.get(to);
  }

  private send(from: string, to: string, message: Message): void {
    this.messagesSent++;
    if (!this.reachable(from, to) || this.rng.chance(this.dropRate)) return;
    this.queue.push({
      at: this.now + 1 + this.rng.int(0, this.maxDelayMs),
      seq: this.seq++,
      from,
      to,
      message: structuredClone(message), // nothing is shared across the "wire"
    });
  }

  private step(): void {
    this.now += this.stepMs;

    while (this.scheduled.length > 0 && this.scheduled[0]!.at <= this.now) this.scheduled.shift()!.run();

    for (let item = this.queue.peek(); item && item.at <= this.now; item = this.queue.peek()) {
      this.queue.pop();
      if (!this.reachable(item.from, item.to)) continue; // link went down while in flight
      if (item.to === this.cloud.id) {
        const reply = this.cloud.receive(item.message, this.now);
        if (reply) this.send(this.cloud.id, item.from, reply);
      } else {
        this.node(item.to).receive(item.message, this.now);
      }
    }

    for (const node of this.nodes.values()) {
      if (this.down.has(node.id)) continue;
      node.tick(this.now);
      if (this.workload && this.rng.chance(this.actionRate)) this.staffAction(node);
    }
  }

  // ---- workload: plausible staff actions based on what each screen shows ----

  private emit<T extends OrderEventType>(node: SyncNode<BranchState>, type: T, payload: OrderEvents[T]): void {
    const event = node.createEvent(type, payload);
    this.created.set(event.id, node.id);
  }

  private staffAction(node: SyncNode<BranchState>): void {
    const r = this.rng;
    const view = node.optimisticState();
    const orders = Object.values(view.orders);
    const open = orders.filter((o) => o.status === "OPEN");
    const paying = orders.filter((o) => o.status === "PAYING");
    const newId = (prefix: string) => `${prefix}-${node.id}-${++this.counter}`;

    if (node.id === this.devices[this.devices.length - 1]) {
      // Kitchen display: bump a cooked item.
      const cooking = orders.flatMap((o) =>
        Object.entries(o.lines)
          .filter(([, l]) => l.fired && !l.ready && !l.voided)
          .map(([lineId]) => ({ orderId: o.id, lineId })),
      );
      if (cooking.length > 0) this.emit(node, "ITEM_BUMPED", r.pick(cooking));
      return;
    }

    const roll = r.next();
    if (roll < 0.15 || open.length === 0) {
      this.emit(node, "ORDER_OPENED", {
        orderId: newId("o"),
        orderType: r.pick(["DINE_IN", "TAKEAWAY", "DELIVERY"] as const),
        tableId: `T${r.int(1, 20)}`,
      });
    } else if (roll < 0.5) {
      // Like the real POS, staff can only pick items the screen shows as available.
      const available = Array.from({ length: 10 }, (_, i) => `m${i}`).filter((m) => !view.soldOut[m]);
      if (available.length === 0) return;
      this.emit(node, "ITEM_ADDED", {
        orderId: r.pick(open).id,
        lineId: newId("l"),
        menuItemId: r.pick(available),
        unitPrice: r.int(40, 400) * 100,
        quantity: r.int(1, 3),
      });
    } else if (roll < 0.6) {
      const order = r.pick(open);
      const unfired = Object.entries(order.lines).filter(([, l]) => !l.fired && !l.voided).map(([id]) => id);
      if (unfired.length > 0) this.emit(node, "ITEMS_FIRED", { orderId: order.id, lineIds: unfired });
    } else if (roll < 0.65) {
      const order = r.pick(open);
      const live = Object.entries(order.lines).filter(([, l]) => !l.voided).map(([id]) => id);
      if (live.length > 0) this.emit(node, "ITEM_VOIDED", { orderId: order.id, lineId: r.pick(live), reason: "guest changed mind" });
    } else if (roll < 0.75) {
      const order = r.pick(open);
      if (Object.keys(order.lines).length > 0) this.emit(node, "PAYMENT_STARTED", { orderId: order.id });
    } else if (roll < 0.85 && paying.length > 0) {
      this.emit(node, "PAYMENT_RECORDED", {
        orderId: r.pick(paying).id,
        paymentId: newId("p"),
        method: r.pick(["CASH", "PROMPTPAY", "CARD"]),
        amount: r.int(100, 2000) * 100,
      });
    } else if (roll < 0.93 && paying.length > 0) {
      const order = r.pick(paying);
      if (Object.keys(order.payments).length > 0) this.emit(node, "ORDER_CLOSED", { orderId: order.id });
      else this.emit(node, "PAYMENT_CANCELLED", { orderId: order.id });
    } else {
      this.emit(node, "MENU_ITEM_AVAILABILITY", { menuItemId: `m${r.int(0, 9)}`, soldOut: r.chance(0.5) });
    }
  }

  // ---- invariants ----

  /** Returns a list of violated guarantees (empty when everything holds). */
  violations(): string[] {
    const problems: string[] = [];
    const leaders = this.leaders();
    if (leaders.length !== 1) return [`expected exactly one hub, found ${leaders.length}`];
    const hub = leaders[0]!;
    const hubLog = hub.entries();

    const ids = hubLog.map((e) => e.event.id);
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (duplicates.length > 0) problems.push(`duplicate events in hub log: ${duplicates.slice(0, 5).join(", ")}`);

    const logged = new Set(ids);
    const lost = [...this.created.keys()].filter((id) => !logged.has(id));
    if (lost.length > 0) problems.push(`${lost.length} events lost, e.g. ${lost.slice(0, 3).join(", ")}`);

    const fingerprint = (entries: readonly { event: { id: string }; status: string }[]) =>
      entries.map((e) => `${e.event.id}:${e.status}`).join("|");
    const hubPrint = fingerprint(hubLog);
    const hubState = JSON.stringify(hub.state);

    for (const node of this.nodes.values()) {
      if (node === hub) continue;
      if (node.leaderId !== hub.id) problems.push(`${node.id} follows ${node.leaderId}, not ${hub.id}`);
      if (!sameBallot(node.logBallot, hub.leaderBallot)) problems.push(`${node.id} holds a log from another hub`);
      if (fingerprint(node.entries()) !== hubPrint) problems.push(`${node.id} log differs from hub`);
      if (JSON.stringify(node.state) !== hubState) problems.push(`${node.id} state differs from hub`);
    }
    for (const node of this.nodes.values()) {
      if (node.pendingEvents().length > 0) problems.push(`${node.id} still has ${node.pendingEvents().length} pending events`);
    }
    // Each fault causes at most a couple of elections; runaway terms mean hubs are fighting.
    if (hub.leaderBallot!.term > 60) problems.push(`term ran away to ${hub.leaderBallot!.term}`);

    if (!this.cloud.isMirrorOf(hub.leaderBallot)) problems.push("cloud mirrors a different hub");
    else if (fingerprint(this.cloud.entries()) !== hubPrint) problems.push("cloud log differs from hub");

    return problems;
  }
}

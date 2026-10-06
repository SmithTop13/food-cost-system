import { compareBallots, sameBallot, type Ballot, type Domain, type LogEntry, type Message, type SyncEvent } from "./types.js";

export interface Timing {
  /** How often the hub sends heartbeats and followers send presence pings. */
  heartbeatMs: number;
  /** Silence from the hub after which followers treat it as gone. */
  electionTimeoutMs: number;
  /** Without a hub for this long, a node stands for election even if a higher-priority node seems alive. */
  electionFallbackMs: number;
  /** How often followers resend events the hub has not yet logged. */
  resubmitMs: number;
  /** How long the hub holds an event whose dependency is missing before rejecting it. */
  deferMs: number;
  /** How often the hub uploads the log to the cloud. */
  uploadMs: number;
  /** Minimum gap between catch-up requests. */
  syncRetryMs: number;
  /** Maximum entries or events per message. */
  maxBatch: number;
  /**
   * Maximum size of one cloud upload (JSON characters). A batch is cut short at this size so a
   * run of large events can never make an upload the server refuses, which would stall sync.
   * Always sends at least one entry.
   */
  maxUploadChars: number;
  /**
   * If the cloud holds a newer hub's log but that hub has not uploaded for this long, assume it
   * is gone for good and claim a newer term. A newer hub that is alive but unreachable on the LAN
   * (a split network) is left alone; the two logs merge when the network heals.
   */
  hubIdleTakeoverMs: number;
}

export const DEFAULT_TIMING: Timing = {
  heartbeatMs: 200,
  electionTimeoutMs: 1500,
  electionFallbackMs: 4000,
  resubmitMs: 300,
  deferMs: 2000,
  uploadMs: 1000,
  syncRetryMs: 300,
  maxBatch: 500,
  maxUploadChars: 4_000_000,
  hubIdleTakeoverMs: 30_000,
};

export interface SyncNodeOptions<S> {
  id: string;
  /** Every device in the branch, highest hub priority first. Must include `id`. */
  priority: readonly string[];
  cloudId?: string;
  domain: Domain<S>;
  send: (to: string, message: Message) => void;
  newId: () => string;
  timing?: Partial<Timing>;
}

export type Role = "LEADER" | "FOLLOWER";

/**
 * One device's view of the branch log. Transport-agnostic: the caller delivers messages
 * with `receive`, drives time with `tick`, and supplies `send`.
 *
 * Guarantees (checked by the chaos tests):
 * - every event created on a device ends up exactly once in the hub's log, as ACCEPTED or REJECTED;
 * - once the network heals, every device holds the same log as the hub, and the cloud mirrors it.
 */
export class SyncNode<S> {
  readonly id: string;
  readonly rank: number;
  role: Role = "FOLLOWER";
  leaderId: string | null = null;
  leaderBallot: Ballot | null = null;
  /** Ballot of the hub whose log this node currently holds. */
  logBallot: Ballot | null = null;
  /** State built from ACCEPTED entries of the log. */
  state: S;

  private readonly opts: SyncNodeOptions<S>;
  private readonly timing: Timing;
  private log: LogEntry[] = [];
  private logIndex = new Map<string, number>();
  /** Events this node knows about that are not yet in its log, oldest first. */
  private pending = new Map<string, SyncEvent>();
  /** Hub only: events waiting for a dependency, with the time first seen. */
  private deferred = new Map<string, { event: SyncEvent; since: number }>();
  private maxTerm = 0;
  private lastHeard = new Map<string, number>();
  private now = 0;
  private lastLeaderContact = 0;
  private leaderlessSince = 0;
  private lastBroadcast = -Infinity;
  private lastResubmit = -Infinity;
  private lastUpload = -Infinity;
  private lastSyncRequest = -Infinity;
  private uploadCursor = 0;
  /**
   * Hub only: when a device first reported a newer term than ours. If no newer hub shows up
   * within the election timeout (e.g. it restarted as a plain device), claim a newer term so
   * the cloud, which may follow that term, accepts our uploads again.
   */
  private newerTermSince: number | null = null;

  constructor(opts: SyncNodeOptions<S>) {
    const rank = opts.priority.indexOf(opts.id);
    if (rank < 0) throw new Error(`node ${opts.id} is missing from the priority list`);
    this.opts = opts;
    this.id = opts.id;
    this.rank = rank;
    this.timing = { ...DEFAULT_TIMING, ...opts.timing };
    this.state = opts.domain.initial();
  }

  get ballot(): Ballot | null {
    return this.role === "LEADER" ? this.leaderBallot : null;
  }

  entries(): readonly LogEntry[] {
    return this.log;
  }

  pendingEvents(): SyncEvent[] {
    return [...this.pending.values()];
  }

  /** State including this device's events the hub has not confirmed yet (what the screen shows). */
  optimisticState(): S {
    const view = this.opts.domain.clone(this.state);
    for (const event of this.pending.values()) this.opts.domain.apply(view, event);
    return view;
  }

  /** Start, or restart after a crash. The log and pending events are durable and kept. */
  start(now: number): void {
    this.now = now;
    this.role = "FOLLOWER";
    this.leaderId = null;
    this.leaderBallot = null;
    this.deferred.clear();
    this.lastLeaderContact = now;
    this.leaderlessSince = now;
    this.lastHeard.clear();
    this.lastHeard.set(this.id, now);
  }

  createEvent<P>(type: string, payload: P, extra: { staffId?: string; createdAt?: number } = {}): SyncEvent<P> {
    const event: SyncEvent<P> = {
      id: this.opts.newId(),
      deviceId: this.id,
      createdAt: extra.createdAt ?? this.now,
      type,
      payload,
      ...(extra.staffId ? { staffId: extra.staffId } : {}),
    };
    this.pending.set(event.id, event);
    if (this.role === "LEADER") this.sequence([event]);
    return event;
  }

  tick(now: number): void {
    this.now = now;
    this.lastHeard.set(this.id, now);
    const t = this.timing;

    if (this.role === "LEADER") {
      if (this.newerTermSince !== null && now - this.newerTermSince >= t.electionTimeoutMs) this.becomeLeader();
      if (now - this.lastBroadcast >= t.heartbeatMs) {
        this.broadcast({ kind: "HEARTBEAT", from: this.id, ballot: this.leaderBallot!, logLength: this.log.length });
        this.lastBroadcast = now;
      }
      if (this.deferred.size > 0) this.sequence([]);
      if (this.opts.cloudId && now - this.lastUpload >= t.uploadMs) {
        this.upload();
        this.lastUpload = now;
      }
      return;
    }

    if (now - this.lastBroadcast >= t.heartbeatMs) {
      this.broadcast({ kind: "PING", from: this.id, term: this.maxTerm });
      this.lastBroadcast = now;
    }

    const leaderAlive = this.leaderId !== null && now - this.lastLeaderContact < t.electionTimeoutMs;
    if (!leaderAlive) {
      if (this.leaderId !== null) {
        this.leaderId = null;
        this.leaderBallot = null;
        this.leaderlessSince = this.lastLeaderContact;
      }
      if (this.shouldStandForElection(now)) this.becomeLeader();
      return;
    }

    if (this.pending.size > 0 && now - this.lastResubmit >= t.resubmitMs) {
      const events = [...this.pending.values()].slice(0, t.maxBatch);
      this.opts.send(this.leaderId!, { kind: "SUBMIT", from: this.id, events });
      this.lastResubmit = now;
    }
  }

  receive(message: Message, now: number): void {
    this.now = now;
    this.lastHeard.set(message.from, now);

    switch (message.kind) {
      case "PING":
        // A device knows a newer term than this hub. Usually the newer hub's heartbeat follows
        // and this hub steps down; if none comes, `tick` claims a newer term (see `newerTermSince`).
        this.maxTerm = Math.max(this.maxTerm, message.term);
        if (this.role === "LEADER" && message.term > this.leaderBallot!.term) this.newerTermSince ??= now;
        return;

      case "HEARTBEAT": {
        this.maxTerm = Math.max(this.maxTerm, message.ballot.term);
        if (!this.acceptLeader(message.from, message.ballot)) return;
        this.lastLeaderContact = now;
        if (!sameBallot(this.logBallot, message.ballot)) this.requestSync(0);
        else if (this.log.length < message.logLength) this.requestSync(this.log.length);
        return;
      }

      case "SUBMIT":
        if (this.role === "LEADER") this.sequence(message.events);
        return;

      case "APPEND": {
        if (this.role === "LEADER" || message.from !== this.leaderId) return;
        if (!sameBallot(message.ballot, this.leaderBallot)) return;
        this.lastLeaderContact = now;
        if (!sameBallot(this.logBallot, message.ballot)) {
          if (message.startIndex === 0) this.replaceLog(message.entries, message.ballot);
          else this.requestSync(0);
        } else if (message.startIndex > this.log.length) {
          this.requestSync(this.log.length);
        } else {
          this.appendReplicated(message.entries.slice(this.log.length - message.startIndex));
        }
        return;
      }

      case "SYNC_REQUEST":
        if (this.role !== "LEADER") return;
        this.opts.send(message.from, {
          kind: "APPEND",
          from: this.id,
          ballot: this.leaderBallot!,
          startIndex: message.fromIndex,
          entries: this.log.slice(message.fromIndex, message.fromIndex + this.timing.maxBatch),
        });
        return;

      case "UPLOAD_ACK":
        if (this.role === "LEADER" && sameBallot(message.ballot, this.leaderBallot)) this.uploadCursor = message.length;
        return;

      case "UPLOAD_REJECT":
        if (this.role !== "LEADER") return;
        if (compareBallots(message.ballot, this.leaderBallot) > 0) {
          if (message.idleMs < this.timing.hubIdleTakeoverMs) return; // that hub is alive elsewhere
          // The cloud's newer hub has gone silent and none of our devices remember its term.
          this.maxTerm = Math.max(this.maxTerm, message.ballot!.term);
          this.becomeLeader();
        } else {
          this.uploadCursor = message.length;
        }
        return;

      case "UPLOAD":
        return; // only the cloud handles uploads
    }
  }

  // ---- leadership ----

  private shouldStandForElection(now: number): boolean {
    const t = this.timing;
    if (now - this.leaderlessSince < t.electionTimeoutMs) return false;
    const betterAlive = this.opts.priority
      .slice(0, this.rank)
      .some((peer) => now - (this.lastHeard.get(peer) ?? -Infinity) < t.electionTimeoutMs);
    return !betterAlive || now - this.leaderlessSince >= t.electionFallbackMs;
  }

  private becomeLeader(): void {
    this.maxTerm += 1;
    const ballot: Ballot = { term: this.maxTerm, rank: this.rank };
    this.role = "LEADER";
    this.leaderId = this.id;
    this.leaderBallot = ballot;
    this.logBallot = ballot;
    this.uploadCursor = 0;
    this.newerTermSince = null;
    this.lastBroadcast = -Infinity;
    this.lastUpload = -Infinity;
    this.sequence([...this.pending.values()]);
  }

  /** Returns true if `from` is (now) this node's hub. */
  private acceptLeader(from: string, ballot: Ballot): boolean {
    if (this.role === "LEADER") {
      if (compareBallots(ballot, this.leaderBallot) <= 0) return false;
      // A better hub exists: step down. Undecided deferred events are still pending here.
      this.role = "FOLLOWER";
      this.deferred.clear();
      this.newerTermSince = null;
    } else if (this.leaderId === from && sameBallot(ballot, this.leaderBallot)) {
      return true;
    } else if (this.leaderId !== null && compareBallots(ballot, this.leaderBallot) <= 0) {
      return false;
    }
    this.leaderId = from;
    this.leaderBallot = ballot;
    this.lastLeaderContact = this.now;
    this.lastResubmit = -Infinity;
    return true;
  }

  // ---- log ----

  /** Hub only: decide and append events, then broadcast the new entries. */
  private sequence(events: SyncEvent[]): void {
    const { domain } = this.opts;
    const start = this.log.length;
    const queue = [...[...this.deferred.values()].map((d) => d.event), ...events];

    // Repeat while a pass accepts something and events are still waiting: an event accepted
    // late in a pass (e.g. ORDER_OPENED) can unblock one deferred earlier (its ITEM_ADDED).
    for (let accepted = true; accepted; ) {
      accepted = false;
      for (const event of queue) {
        if (this.logIndex.has(event.id)) {
          this.pending.delete(event.id);
          this.deferred.delete(event.id);
          continue;
        }
        const rejection = domain.apply(this.state, event);
        if (rejection?.retry) {
          const since = this.deferred.get(event.id)?.since ?? this.now;
          if (this.now - since < this.timing.deferMs) {
            this.deferred.set(event.id, { event, since });
            continue;
          }
        }
        this.push({
          index: this.log.length,
          ballot: this.leaderBallot!,
          event,
          status: rejection ? "REJECTED" : "ACCEPTED",
          ...(rejection ? { reason: rejection.reason } : {}),
        });
        this.deferred.delete(event.id);
        if (!rejection) accepted = true;
      }
      if (this.deferred.size === 0) break;
    }

    if (this.log.length > start) {
      this.broadcast({
        kind: "APPEND",
        from: this.id,
        ballot: this.leaderBallot!,
        startIndex: start,
        entries: this.log.slice(start),
      });
    }
  }

  private push(entry: LogEntry): void {
    this.log.push(entry);
    this.logIndex.set(entry.event.id, entry.index);
    this.pending.delete(entry.event.id);
  }

  private appendReplicated(entries: LogEntry[]): void {
    for (const entry of entries) {
      if (entry.status === "ACCEPTED") {
        const rejection = this.opts.domain.apply(this.state, entry.event);
        if (rejection) {
          throw new Error(`replica diverged at ${entry.index}: hub accepted ${entry.event.id} but ${rejection.reason}`);
        }
      }
      this.push(entry);
    }
  }

  /** Adopt a different hub's log. Events only in the old log go back to pending, so nothing is lost. */
  private replaceLog(entries: LogEntry[], ballot: Ballot): void {
    const old = this.log;
    this.log = [];
    this.logIndex = new Map();
    this.logBallot = ballot;
    this.state = this.opts.domain.initial();
    this.appendReplicated(entries);

    // Old-log events first (in log order, so causes come before effects), then newer local events.
    const pending = new Map<string, SyncEvent>();
    for (const entry of old) {
      if (!this.logIndex.has(entry.event.id)) pending.set(entry.event.id, entry.event);
    }
    for (const [id, event] of this.pending) {
      if (!this.logIndex.has(id)) pending.set(id, event);
    }
    this.pending = pending;
  }

  private requestSync(fromIndex: number): void {
    if (this.leaderId === null || this.now - this.lastSyncRequest < this.timing.syncRetryMs) return;
    this.lastSyncRequest = this.now;
    this.opts.send(this.leaderId, { kind: "SYNC_REQUEST", from: this.id, fromIndex });
  }

  private upload(): void {
    const start = Math.min(this.uploadCursor, this.log.length);
    const entries: LogEntry[] = [];
    let chars = 0;
    for (const entry of this.log.slice(start, start + this.timing.maxBatch)) {
      chars += JSON.stringify(entry).length + 1;
      if (entries.length > 0 && chars > this.timing.maxUploadChars) break;
      entries.push(entry);
    }
    this.opts.send(this.opts.cloudId!, { kind: "UPLOAD", from: this.id, ballot: this.leaderBallot!, startIndex: start, entries });
  }

  private broadcast(message: Message): void {
    for (const peer of this.opts.priority) if (peer !== this.id) this.opts.send(peer, message);
  }
}

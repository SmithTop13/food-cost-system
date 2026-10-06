/**
 * Identifies one leadership period. A higher term wins; within a term, the lower rank
 * (higher priority) wins, so two hubs elected in the same term never tie.
 */
export interface Ballot {
  term: number;
  rank: number;
}

/** > 0 if `a` beats `b`, < 0 if `b` beats `a`, 0 if equal. `null` loses to any ballot. */
export function compareBallots(a: Ballot | null, b: Ballot | null): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? -1 : 1;
  if (a.term !== b.term) return a.term - b.term;
  return b.rank - a.rank;
}

export function sameBallot(a: Ballot | null, b: Ballot | null): boolean {
  return compareBallots(a, b) === 0;
}

/** A change made on a device. Immutable once created. */
export interface SyncEvent<P = unknown> {
  /** ULID, unique across all devices. */
  id: string;
  deviceId: string;
  staffId?: string;
  /** Device clock (ms). For display only; ordering comes from the hub. */
  createdAt: number;
  type: string;
  payload: P;
}

export type EntryStatus = "ACCEPTED" | "REJECTED";

/** An event placed in the branch log by the hub. */
export interface LogEntry {
  index: number;
  /** Ballot of the hub that sequenced this entry. */
  ballot: Ballot;
  event: SyncEvent;
  status: EntryStatus;
  reason?: string;
}

export interface Rejection {
  reason: string;
  /** The event depends on something not yet in the log; the hub retries before rejecting. */
  retry?: boolean;
}

/** Business rules the hub applies to each event, in log order. */
export interface Domain<S> {
  initial(): S;
  /** Validate `event` against `state`. On success mutate `state` and return null; on failure leave it unchanged. */
  apply(state: S, event: SyncEvent): Rejection | null;
  clone(state: S): S;
}

export type Message =
  /** `term`: the highest term the sender knows, so a hub learns of newer terms it missed. */
  | { kind: "PING"; from: string; term: number }
  | { kind: "HEARTBEAT"; from: string; ballot: Ballot; logLength: number }
  | { kind: "SUBMIT"; from: string; events: SyncEvent[] }
  | { kind: "APPEND"; from: string; ballot: Ballot; startIndex: number; entries: LogEntry[] }
  | { kind: "SYNC_REQUEST"; from: string; fromIndex: number }
  | { kind: "UPLOAD"; from: string; ballot: Ballot; startIndex: number; entries: LogEntry[] }
  | { kind: "UPLOAD_ACK"; from: string; ballot: Ballot; length: number }
  /** `idleMs`: how long since the hub holding the cloud's ballot last uploaded. */
  | { kind: "UPLOAD_REJECT"; from: string; ballot: Ballot | null; length: number; idleMs: number };

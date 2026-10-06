import { compareBallots, sameBallot, type Ballot, type LogEntry, type Message } from "./types.js";

/**
 * The cloud's copy of one branch log. It mirrors the hub with the best ballot it has seen:
 * an upload from a newer hub replaces the copy (starting from index 0), and uploads from
 * older hubs are refused. Safe to receive the same upload any number of times.
 */
export class CloudMirror {
  ballot: Ballot | null = null;
  private log: LogEntry[] = [];
  private lastAcceptedAt = 0;

  constructor(readonly id = "cloud") {}

  entries(): readonly LogEntry[] {
    return this.log;
  }

  /** Handle an UPLOAD and return the reply for the hub. */
  receive(message: Message, now: number): Message | null {
    if (message.kind !== "UPLOAD") return null;
    const reject = (ballot: Ballot | null, length: number): Message => ({
      kind: "UPLOAD_REJECT",
      from: this.id,
      ballot,
      length,
      idleMs: now - this.lastAcceptedAt,
    });
    const order = compareBallots(message.ballot, this.ballot);

    if (order < 0) return reject(this.ballot, this.log.length);
    this.lastAcceptedAt = now;
    if (order > 0) {
      if (message.startIndex !== 0) return reject(message.ballot, 0);
      this.ballot = message.ballot;
      this.log = message.entries.slice();
    } else if (message.startIndex > this.log.length) {
      return reject(this.ballot, this.log.length);
    } else {
      this.log.push(...message.entries.slice(this.log.length - message.startIndex));
    }
    return { kind: "UPLOAD_ACK", from: this.id, ballot: message.ballot, length: this.log.length };
  }

  isMirrorOf(ballot: Ballot | null): boolean {
    return sameBallot(ballot, this.ballot);
  }
}

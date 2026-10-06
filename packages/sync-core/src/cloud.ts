import { compareBallots, sameBallot, type Ballot, type LogEntry, type Message } from "./types.js";

/** What the cloud stores about one branch log besides the entries themselves. */
export interface MirrorHead {
  ballot: Ballot | null;
  length: number;
  /** When the hub holding `ballot` last uploaded successfully (ms). */
  lastAcceptedAt: number;
}

export type UploadDecision = (
  | { action: "REPLACE"; ballot: Ballot; entries: LogEntry[] }
  | { action: "APPEND"; entries: LogEntry[] }
  | { action: "REJECT" }
) & {
  reply: Message;
  /** The uploader is the mirrored hub (or a newer one): store `now` as `lastAcceptedAt`. */
  touch: boolean;
};

type Upload = Extract<Message, { kind: "UPLOAD" }>;

/**
 * The cloud's rules for an upload. The cloud mirrors the hub with the best ballot it has seen:
 * an upload from a newer hub replaces the copy (it must start at index 0), and uploads from older
 * hubs are refused. Repeating an upload is harmless. Pure, so every storage backend shares it.
 */
export function decideUpload(head: MirrorHead, upload: Upload, now: number, cloudId = "cloud"): UploadDecision {
  const order = compareBallots(upload.ballot, head.ballot);
  const touch = order >= 0;
  const reject = (ballot: Ballot | null, length: number): UploadDecision => ({
    action: "REJECT",
    reply: { kind: "UPLOAD_REJECT", from: cloudId, ballot, length, idleMs: now - head.lastAcceptedAt },
    touch,
  });
  const ack = (length: number): Message => ({ kind: "UPLOAD_ACK", from: cloudId, ballot: upload.ballot, length });

  if (order < 0) return reject(head.ballot, head.length);
  if (order > 0) {
    if (upload.startIndex !== 0) return reject(upload.ballot, 0);
    return { action: "REPLACE", ballot: upload.ballot, entries: upload.entries, reply: ack(upload.entries.length), touch };
  }
  if (upload.startIndex > head.length) return reject(head.ballot, head.length);
  const fresh = upload.entries.slice(head.length - upload.startIndex);
  return { action: "APPEND", entries: fresh, reply: ack(head.length + fresh.length), touch };
}

/** In-memory cloud copy of one branch log (used by the simulator and tests). */
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
    const head = { ballot: this.ballot, length: this.log.length, lastAcceptedAt: this.lastAcceptedAt };
    const decision = decideUpload(head, message, now, this.id);
    if (decision.action === "REPLACE") {
      this.ballot = decision.ballot;
      this.log = decision.entries.slice();
    } else if (decision.action === "APPEND") {
      this.log.push(...decision.entries);
    }
    if (decision.touch) this.lastAcceptedAt = now;
    return decision.reply;
  }

  isMirrorOf(ballot: Ballot | null): boolean {
    return sameBallot(ballot, this.ballot);
  }
}

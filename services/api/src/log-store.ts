import { decideUpload, type Ballot, type LogEntry, type Message } from "@fcs/sync-core";
import type pg from "pg";

type Upload = Extract<Message, { kind: "UPLOAD" }>;

/** PostgreSQL storage for the cloud copy of each branch log. Same rules as the in-memory CloudMirror. */
export class LogStore {
  constructor(private readonly pool: pg.Pool) {}

  async upload(branchId: string, upload: Upload, now = new Date()): Promise<Message> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO branch_log_heads (branch_id) VALUES ($1) ON CONFLICT DO NOTHING", [branchId]);
      // Row lock: uploads for one branch are applied one at a time.
      const { rows } = await client.query(
        `SELECT ballot_term, ballot_rank, length, last_accepted_at
           FROM branch_log_heads WHERE branch_id = $1 FOR UPDATE`,
        [branchId],
      );
      const row = rows[0];
      const head = {
        ballot: row.ballot_term === null ? null : { term: row.ballot_term, rank: row.ballot_rank },
        length: row.length,
        lastAcceptedAt: (row.last_accepted_at as Date).getTime(),
      };
      const decision = decideUpload(head, upload, now.getTime());

      let ballot: Ballot | null = head.ballot;
      let length = head.length;
      if (decision.action === "REPLACE") {
        await client.query("DELETE FROM branch_log WHERE branch_id = $1", [branchId]);
        await insertEntries(client, branchId, decision.entries);
        ballot = decision.ballot;
        length = decision.entries.length;
      } else if (decision.action === "APPEND") {
        await insertEntries(client, branchId, decision.entries);
        length += decision.entries.length;
      }
      await client.query(
        `UPDATE branch_log_heads
            SET ballot_term = $2, ballot_rank = $3, length = $4,
                last_accepted_at = CASE WHEN $5 THEN $6::timestamptz ELSE last_accepted_at END
          WHERE branch_id = $1`,
        [branchId, ballot?.term ?? null, ballot?.rank ?? null, length, decision.touch, now],
      );
      await client.query("COMMIT");
      return decision.reply;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async entries(branchId: string, fromIndex = 0, limit = 500): Promise<LogEntry[]> {
    const { rows } = await this.pool.query(
      `SELECT idx, ballot_term, ballot_rank, status, reason, event
         FROM branch_log WHERE branch_id = $1 AND idx >= $2
        ORDER BY idx LIMIT $3`,
      [branchId, fromIndex, limit],
    );
    return rows.map((r) => ({
      index: r.idx,
      ballot: { term: r.ballot_term, rank: r.ballot_rank },
      event: r.event,
      status: r.status,
      ...(r.reason === null ? {} : { reason: r.reason }),
    }));
  }
}

async function insertEntries(client: pg.PoolClient, branchId: string, entries: LogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await client.query(
    `INSERT INTO branch_log
       (branch_id, idx, event_id, ballot_term, ballot_rank, status, reason,
        event_type, device_id, staff_id, created_at, event)
     SELECT $1, (e->>'index')::int, e->'event'->>'id',
            (e->'ballot'->>'term')::int, (e->'ballot'->>'rank')::int,
            e->>'status', e->>'reason',
            e->'event'->>'type', e->'event'->>'deviceId', e->'event'->>'staffId',
            to_timestamp((e->'event'->>'createdAt')::double precision / 1000),
            e->'event'
       FROM jsonb_array_elements($2::jsonb) AS e`,
    [branchId, JSON.stringify(entries)],
  );
}

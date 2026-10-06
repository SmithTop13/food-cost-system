import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { LogEntry, Message } from "@fcs/sync-core";
import { buildApp } from "../src/app.js";
import { migrate } from "../src/migrate.js";

const DATABASE_URL = process.env["DATABASE_URL"];

// Needs PostgreSQL. Locally: DATABASE_URL=postgres://fcs:fcs@localhost/fcs_test pnpm test
describe.skipIf(!DATABASE_URL)("API with PostgreSQL", () => {
  let pool: pg.Pool;
  let app: ReturnType<typeof buildApp>;
  let branchId: string;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    expect(await migrate(pool)).toEqual(["001_core.sql"]);
    expect(await migrate(pool)).toEqual([]); // second run is a no-op
    app = buildApp(pool);
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
  });

  beforeEach(async () => {
    const account = await pool.query("INSERT INTO accounts (name) VALUES ('Baan Somtum') RETURNING id");
    const branch = await pool.query("INSERT INTO branches (account_id, name) VALUES ($1, 'Ari') RETURNING id", [account.rows[0].id]);
    branchId = branch.rows[0].id;
  });

  let seq = 0;
  const entry = (index: number, term: number, status: "ACCEPTED" | "REJECTED" = "ACCEPTED"): LogEntry => ({
    index,
    ballot: { term, rank: 0 },
    status,
    ...(status === "REJECTED" ? { reason: "bill is locked for payment" } : {}),
    event: {
      id: `01K${String(++seq).padStart(23, "0")}`,
      deviceId: "pos1",
      createdAt: 1_790_000_000_000 + index,
      type: "ORDER_OPENED",
      payload: { orderId: `o${index}`, orderType: "DINE_IN" },
    },
  });
  const upload = (term: number, startIndex: number, entries: LogEntry[]) =>
    app.inject({
      method: "POST",
      url: `/v1/branches/${branchId}/log/upload`,
      payload: { kind: "UPLOAD", from: "pos1", ballot: { term, rank: 0 }, startIndex, entries },
    });

  it("reports health", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("stores uploads idempotently and serves them back", async () => {
    const first = [entry(0, 1), entry(1, 1), entry(2, 1, "REJECTED")];
    expect((await upload(1, 0, first)).json()).toMatchObject({ kind: "UPLOAD_ACK", length: 3 });
    expect((await upload(1, 0, first)).json()).toMatchObject({ kind: "UPLOAD_ACK", length: 3 }); // retry
    expect((await upload(1, 1, [first[1]!, first[2]!, entry(3, 1)])).json()).toMatchObject({ length: 4 }); // overlap

    const res = await app.inject({ method: "GET", url: `/v1/branches/${branchId}/log?from=2` });
    const entries = res.json().entries as LogEntry[];
    expect(entries.map((e) => e.index)).toEqual([2, 3]);
    expect(entries[0]).toEqual(first[2]);
  });

  it("replaces the copy when a newer hub uploads, and refuses older hubs", async () => {
    await upload(1, 0, [entry(0, 1), entry(1, 1)]);
    const gap = (await upload(2, 1, [entry(1, 2)])).json() as Message;
    expect(gap).toMatchObject({ kind: "UPLOAD_REJECT", length: 0 }); // newer hub must start from 0

    const newer = [entry(0, 1), entry(1, 2)];
    expect((await upload(2, 0, newer)).json()).toMatchObject({ kind: "UPLOAD_ACK", length: 2 });
    const stale = (await upload(1, 2, [entry(2, 1)])).json();
    expect(stale).toMatchObject({ kind: "UPLOAD_REJECT", ballot: { term: 2, rank: 0 }, length: 2 });
    expect(stale.idleMs).toBeGreaterThanOrEqual(0);

    const rows = await pool.query("SELECT event_id FROM branch_log WHERE branch_id = $1 ORDER BY idx", [branchId]);
    expect(rows.rows.map((r) => r.event_id)).toEqual(newer.map((e) => e.event.id));
  });

  it("applies concurrent uploads for one branch one at a time", async () => {
    const entries = Array.from({ length: 40 }, (_, i) => entry(i, 1));
    const results = await Promise.all(Array.from({ length: 8 }, () => upload(1, 0, entries)));
    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    const count = await pool.query("SELECT count(*)::int AS n FROM branch_log WHERE branch_id = $1", [branchId]);
    expect(count.rows[0].n).toBe(40);
  });

  it("rejects malformed uploads", async () => {
    expect((await upload(1, 0, [entry(5, 1)])).statusCode).toBe(400); // index does not match position
    const bad = await app.inject({
      method: "POST",
      url: `/v1/branches/${branchId}/log/upload`,
      payload: { kind: "UPLOAD", from: "pos1", ballot: { term: 0, rank: 0 }, startIndex: 0, entries: [] },
    });
    expect(bad.statusCode).toBe(400);
  });

  it("enforces schema rules on tax data", async () => {
    await expect(pool.query("UPDATE branches SET tax_id = '123' WHERE id = $1", [branchId])).rejects.toThrow(/check constraint/);
    await pool.query("UPDATE branches SET tax_id = '0105556123456', vat_registered = true WHERE id = $1", [branchId]);
  });
});

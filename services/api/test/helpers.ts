import pg from "pg";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { migrate } from "../src/migrate.js";

export const DATABASE_URL = process.env["DATABASE_URL"];

/** Fresh schema and app. Test files run one at a time (vitest.config.ts). */
export async function setup(): Promise<{ pool: pg.Pool; app: FastifyInstance }> {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(pool);
  return { pool, app: buildApp(pool) };
}

let n = 0;

/** Sign up a new restaurant; returns its ids and the owner's session token. */
export async function signup(app: FastifyInstance) {
  const res = await app.inject({
    method: "POST",
    url: "/v1/signup",
    payload: {
      accountName: `Restaurant ${++n}`,
      branchName: "Ari",
      ownerName: "Owner",
      email: `owner${n}@example.com`,
      password: "correct horse battery",
    },
  });
  if (res.statusCode !== 201) throw new Error(res.body);
  return res.json() as { accountId: string; branchId: string; userId: string; token: string; email?: string };
}

export async function pairDevice(app: FastifyInstance, ownerToken: string, branchId: string, name = "POS 1") {
  const code = await app.inject({
    method: "POST",
    url: `/v1/branches/${branchId}/pairing-codes`,
    headers: { authorization: `Bearer ${ownerToken}` },
  });
  if (code.statusCode !== 201) throw new Error(code.body);
  const res = await app.inject({
    method: "POST",
    url: "/v1/devices/pair",
    payload: { code: code.json().code, name, kind: "POS" },
  });
  if (res.statusCode !== 201) throw new Error(res.body);
  return res.json() as { device: { id: string; branchId: string; hubPriority: number }; token: string };
}

export const auth = (token: string) => ({ authorization: `Bearer ${token}` });

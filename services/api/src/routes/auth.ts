import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { HttpError, requireUser } from "../context.js";
import { hashSecret, newToken, tokenHash, verifySecret } from "../crypto.js";

const SESSION_DAYS = 30;

const email = { type: "string", format: "email", maxLength: 254 } as const;
const password = { type: "string", minLength: 10, maxLength: 200 } as const;
const name = { type: "string", minLength: 1, maxLength: 120 } as const;

async function createSession(db: pg.Pool | pg.PoolClient, userId: string) {
  const token = newToken();
  const { rows } = await db.query(
    `INSERT INTO user_sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + make_interval(days => $3)) RETURNING expires_at`,
    [tokenHash(token), userId, SESSION_DAYS],
  );
  return { token, expiresAt: rows[0].expires_at as Date };
}

export function authRoutes(app: FastifyInstance, pool: pg.Pool): void {
  // New restaurant: account, first branch and owner in one step.
  app.post<{ Body: { accountName: string; branchName: string; ownerName: string; email: string; password: string } }>(
    "/v1/signup",
    {
      schema: {
        body: {
          type: "object",
          required: ["accountName", "branchName", "ownerName", "email", "password"],
          additionalProperties: false,
          properties: { accountName: name, branchName: name, ownerName: name, email, password },
        },
      },
    },
    async (request, reply) => {
      const body = request.body;
      const passwordHash = await hashSecret(body.password);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const account = await client.query("INSERT INTO accounts (name) VALUES ($1) RETURNING id", [body.accountName]);
        const accountId = account.rows[0].id;
        const branch = await client.query("INSERT INTO branches (account_id, name) VALUES ($1, $2) RETURNING id", [
          accountId,
          body.branchName,
        ]);
        const user = await client.query(
          `INSERT INTO users (account_id, name, email, password_hash, role)
           VALUES ($1, $2, $3, $4, 'OWNER') RETURNING id`,
          [accountId, body.ownerName, body.email.toLowerCase(), passwordHash],
        );
        const session = await createSession(client, user.rows[0].id);
        await client.query("COMMIT");
        return reply.code(201).send({ accountId, branchId: branch.rows[0].id, userId: user.rows[0].id, ...session });
      } catch (error) {
        await client.query("ROLLBACK");
        if ((error as { code?: string }).code === "23505") throw new HttpError(409, "email is already registered");
        throw error;
      } finally {
        client.release();
      }
    },
  );

  // TODO(S1): rate-limit failed sign-ins per email and per IP.
  app.post<{ Body: { email: string; password: string } }>(
    "/v1/auth/login",
    {
      schema: {
        body: { type: "object", required: ["email", "password"], properties: { email, password: { type: "string", maxLength: 200 } } },
      },
    },
    async (request) => {
      const { rows } = await pool.query(
        "SELECT id, password_hash FROM users WHERE email = $1 AND active AND role IN ('OWNER', 'MANAGER')",
        [request.body.email.toLowerCase()],
      );
      const ok = await verifySecret(request.body.password, rows[0]?.password_hash ?? null);
      if (!ok) throw new HttpError(401, "wrong email or password");
      return createSession(pool, rows[0].id);
    },
  );

  app.post("/v1/auth/logout", async (request, reply) => {
    await requireUser(pool, request);
    const token = request.headers.authorization!.slice("Bearer ".length).trim();
    await pool.query("DELETE FROM user_sessions WHERE token_hash = $1", [tokenHash(token)]);
    return reply.code(204).send();
  });

  app.get("/v1/me", async (request) => {
    const user = await requireUser(pool, request);
    const { rows } = await pool.query("SELECT name, email FROM users WHERE id = $1", [user.id]);
    const branches = await pool.query(
      `SELECT b.id, b.name FROM branches b
        WHERE b.account_id = $1
          AND ($2 = 'OWNER' OR EXISTS (SELECT 1 FROM user_branches ub WHERE ub.branch_id = b.id AND ub.user_id = $3))
        ORDER BY b.name`,
      [user.accountId, user.role, user.id],
    );
    return { id: user.id, accountId: user.accountId, role: user.role, ...rows[0], branches: branches.rows };
  });
}

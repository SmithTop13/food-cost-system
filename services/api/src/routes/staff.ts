import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { grantsFor, HttpError, requireBranchPermission, requireDevice, requireUser } from "../context.js";
import { hashSecret } from "../crypto.js";

const branchParams = { type: "object", properties: { branchId: { type: "string", format: "uuid" } } } as const;

export function staffRoutes(app: FastifyInstance, pool: pg.Pool): void {
  // Staff with a PIN for a branch.
  app.post<{ Params: { branchId: string }; Body: { name: string; role: string; pin: string } }>(
    "/v1/branches/:branchId/staff",
    {
      schema: {
        params: branchParams,
        body: {
          type: "object",
          required: ["name", "role", "pin"],
          additionalProperties: false,
          properties: {
            name: { type: "string", minLength: 1, maxLength: 120 },
            role: { enum: ["MANAGER", "CASHIER", "WAITER", "KITCHEN"] },
            pin: { type: "string", pattern: "^[0-9]{4,6}$" },
          },
        },
      },
    },
    async (request, reply) => {
      const user = await requireUser(pool, request);
      await requireBranchPermission(pool, user, request.params.branchId, "MANAGE_STAFF");
      if (request.body.role === "MANAGER" && user.role !== "OWNER") throw new HttpError(403, "only the owner can add managers");
      const pinHash = await hashSecret(request.body.pin);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const created = await client.query(
          "INSERT INTO users (account_id, name, pin_hash, role) VALUES ($1, $2, $3, $4) RETURNING id",
          [user.accountId, request.body.name, pinHash, request.body.role],
        );
        await client.query("INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)", [
          created.rows[0].id,
          request.params.branchId,
        ]);
        await client.query("COMMIT");
        return reply.code(201).send({ id: created.rows[0].id });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  );

  app.get<{ Params: { branchId: string } }>("/v1/branches/:branchId/staff", { schema: { params: branchParams } }, async (request) => {
    const user = await requireUser(pool, request);
    await requireBranchPermission(pool, user, request.params.branchId, "MANAGE_STAFF");
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.role, u.active
         FROM users u JOIN user_branches ub ON ub.user_id = u.id
        WHERE ub.branch_id = $1 AND u.account_id = $2 AND u.role <> 'OWNER'
        ORDER BY u.name`,
      [request.params.branchId, user.accountId],
    );
    return { staff: rows };
  });

  // What a paired device needs to sign staff in offline: PIN hashes, roles and permissions.
  app.get("/v1/devices/me/roster", async (request) => {
    const device = await requireDevice(pool, request);
    const staff = await pool.query(
      `SELECT u.id, u.name, u.role, u.pin_hash AS "pinHash"
         FROM users u
        WHERE u.account_id = $1 AND u.active AND u.pin_hash IS NOT NULL
          AND (u.role = 'OWNER' OR EXISTS (SELECT 1 FROM user_branches ub WHERE ub.user_id = u.id AND ub.branch_id = $2))
        ORDER BY u.name`,
      [device.accountId, device.branchId],
    );
    return { branchId: device.branchId, deviceId: device.id, staff: staff.rows, permissions: await grantsFor(pool, device.accountId) };
  });
}

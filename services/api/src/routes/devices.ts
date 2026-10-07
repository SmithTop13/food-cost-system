import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { HttpError, requireBranchPermission, requireUser } from "../context.js";
import { newPairingCode, newToken, normalisePairingCode, tokenHash } from "../crypto.js";
import { assertNotLimited, LIMITS, recordAttempt } from "../rate-limit.js";

const PAIRING_MINUTES = 15;
const branchParams = { type: "object", properties: { branchId: { type: "string", format: "uuid" } } } as const;

export function deviceRoutes(app: FastifyInstance, pool: pg.Pool): void {
  // A manager creates a one-time code on the dashboard and types it into the new tablet.
  app.post<{ Params: { branchId: string } }>(
    "/v1/branches/:branchId/pairing-codes",
    { schema: { params: branchParams } },
    async (request, reply) => {
      const user = await requireUser(pool, request);
      await requireBranchPermission(pool, user, request.params.branchId, "MANAGE_DEVICES");
      const code = newPairingCode();
      const { rows } = await pool.query(
        `INSERT INTO device_pairing_codes (code_hash, branch_id, created_by, expires_at)
         VALUES ($1, $2, $3, now() + make_interval(mins => $4)) RETURNING expires_at`,
        [tokenHash(normalisePairingCode(code)), request.params.branchId, user.id, PAIRING_MINUTES],
      );
      return reply.code(201).send({ code, expiresAt: rows[0].expires_at });
    },
  );

  app.post<{ Body: { code: string; name: string; kind: "POS" | "WAITER" | "KDS" | "KIOSK" } }>(
    "/v1/devices/pair",
    {
      schema: {
        body: {
          type: "object",
          required: ["code", "name", "kind"],
          additionalProperties: false,
          properties: {
            code: { type: "string", minLength: 8, maxLength: 12 },
            name: { type: "string", minLength: 1, maxLength: 60 },
            kind: { enum: ["POS", "WAITER", "KDS", "KIOSK"] },
          },
        },
      },
    },
    async (request, reply) => {
      const { code, name, kind } = request.body;
      const ipKey = `pair:ip:${request.ip}`;
      await assertNotLimited(pool, ipKey, LIMITS.pairPerIp);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const pairing = await client.query(
          `SELECT code_hash, branch_id FROM device_pairing_codes
            WHERE code_hash = $1 AND used_at IS NULL AND expires_at > now()
            FOR UPDATE`,
          [tokenHash(normalisePairingCode(code))],
        );
        if (!pairing.rows[0]) {
          await recordAttempt(pool, ipKey, LIMITS.pairPerIp);
          throw new HttpError(400, "pairing code is wrong, used or expired");
        }
        const branchId = pairing.rows[0].branch_id;

        // Serialise pairings per branch so two tablets never get the same hub priority.
        await client.query("SELECT 1 FROM branches WHERE id = $1 FOR UPDATE", [branchId]);
        const token = newToken();
        const device = await client.query(
          `INSERT INTO devices (branch_id, name, kind, hub_priority, token_hash)
           VALUES ($1, $2, $3,
                   (SELECT coalesce(max(hub_priority), -1) + 1 FROM devices WHERE branch_id = $1 AND retired_at IS NULL),
                   $4)
           RETURNING id, hub_priority`,
          [branchId, name, kind, tokenHash(token)],
        );
        await client.query("UPDATE device_pairing_codes SET used_at = now(), device_id = $2 WHERE code_hash = $1", [
          pairing.rows[0].code_hash,
          device.rows[0].id,
        ]);
        await client.query("COMMIT");
        return reply.code(201).send({
          device: { id: device.rows[0].id, branchId, name, kind, hubPriority: device.rows[0].hub_priority },
          token,
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  );

  app.get<{ Params: { branchId: string } }>("/v1/branches/:branchId/devices", { schema: { params: branchParams } }, async (request) => {
    const user = await requireUser(pool, request);
    await requireBranchPermission(pool, user, request.params.branchId, "MANAGE_DEVICES");
    const { rows } = await pool.query(
      `SELECT id, name, kind, hub_priority AS "hubPriority", last_seen_at AS "lastSeenAt"
         FROM devices WHERE branch_id = $1 AND retired_at IS NULL ORDER BY hub_priority`,
      [request.params.branchId],
    );
    return { devices: rows };
  });

  // Lost or replaced tablet: its token stops working immediately.
  app.delete<{ Params: { branchId: string; deviceId: string } }>(
    "/v1/branches/:branchId/devices/:deviceId",
    {
      schema: {
        params: {
          type: "object",
          properties: { branchId: { type: "string", format: "uuid" }, deviceId: { type: "string", format: "uuid" } },
        },
      },
    },
    async (request, reply) => {
      const user = await requireUser(pool, request);
      await requireBranchPermission(pool, user, request.params.branchId, "MANAGE_DEVICES");
      const { rowCount } = await pool.query(
        `UPDATE devices SET retired_at = now(), token_hash = NULL
          WHERE id = $1 AND branch_id = $2 AND retired_at IS NULL`,
        [request.params.deviceId, request.params.branchId],
      );
      if (!rowCount) throw new HttpError(404, "device not found");
      return reply.code(204).send();
    },
  );
}

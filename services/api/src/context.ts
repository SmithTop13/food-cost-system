import type { FastifyRequest } from "fastify";
import type pg from "pg";
import { tokenHash } from "./crypto.js";
import { effectiveGrants, type Grant, type Permission, type Role } from "./permissions.js";

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export interface UserPrincipal {
  kind: "user";
  id: string;
  accountId: string;
  role: Role;
}

export interface DevicePrincipal {
  kind: "device";
  id: string;
  branchId: string;
  accountId: string;
}

function bearer(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

export async function findPrincipal(pool: pg.Pool, request: FastifyRequest): Promise<UserPrincipal | DevicePrincipal | null> {
  const token = bearer(request);
  if (!token) return null;
  const hash = tokenHash(token);

  const user = await pool.query(
    `SELECT u.id, u.account_id, u.role
       FROM user_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active`,
    [hash],
  );
  if (user.rows[0]) return { kind: "user", id: user.rows[0].id, accountId: user.rows[0].account_id, role: user.rows[0].role };

  const device = await pool.query(
    `SELECT d.id, d.branch_id, b.account_id
       FROM devices d JOIN branches b ON b.id = d.branch_id
      WHERE d.token_hash = $1 AND d.retired_at IS NULL`,
    [hash],
  );
  if (device.rows[0]) {
    await pool.query("UPDATE devices SET last_seen_at = now() WHERE id = $1", [device.rows[0].id]);
    return { kind: "device", id: device.rows[0].id, branchId: device.rows[0].branch_id, accountId: device.rows[0].account_id };
  }
  return null;
}

export async function requireUser(pool: pg.Pool, request: FastifyRequest): Promise<UserPrincipal> {
  const principal = await findPrincipal(pool, request);
  if (principal?.kind !== "user") throw new HttpError(401, "sign in required");
  return principal;
}

export async function requireDevice(pool: pg.Pool, request: FastifyRequest): Promise<DevicePrincipal> {
  const principal = await findPrincipal(pool, request);
  if (principal?.kind !== "device") throw new HttpError(401, "paired device required");
  return principal;
}

export async function grantsFor(pool: pg.Pool, accountId: string) {
  const { rows } = await pool.query(
    "SELECT role, permission, grant_level AS grant FROM role_permissions WHERE account_id = $1",
    [accountId],
  );
  return effectiveGrants(rows);
}

/**
 * The user must be able to reach the branch (owners: every branch in their account; others:
 * assigned branches) and hold `permission` outright. 404 rather than 403 for other accounts'
 * branches, so branch IDs cannot be probed.
 */
export async function requireBranchPermission(
  pool: pg.Pool,
  user: UserPrincipal,
  branchId: string,
  ...anyOf: Permission[]
): Promise<void> {
  const { rows } = await pool.query(
    `SELECT 1 FROM branches b
      WHERE b.id = $1 AND b.account_id = $2
        AND ($3 = 'OWNER' OR EXISTS (SELECT 1 FROM user_branches ub WHERE ub.branch_id = b.id AND ub.user_id = $4))`,
    [branchId, user.accountId, user.role, user.id],
  );
  if (!rows[0]) throw new HttpError(404, "branch not found");
  const grants = await grantsFor(pool, user.accountId);
  const allowed = anyOf.some((p) => (grants[user.role][p] as Grant) === "ALLOW");
  if (!allowed) throw new HttpError(403, `requires ${anyOf.join(" or ")}`);
}

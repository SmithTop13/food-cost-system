import type pg from "pg";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashSecret, verifySecret } from "../src/crypto.js";
import { DEFAULT_GRANTS } from "../src/permissions.js";
import { auth, DATABASE_URL, pairDevice, setup, signup } from "./helpers.js";

describe.skipIf(!DATABASE_URL)("sign-in, devices and staff", () => {
  let pool: pg.Pool;
  let app: FastifyInstance;

  beforeAll(async () => {
    ({ pool, app } = await setup());
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
  });

  const post = (url: string, payload?: object, token?: string) =>
    app.inject({ method: "POST", url, ...(payload ? { payload } : {}), ...(token ? { headers: auth(token) } : {}) });
  const get = (url: string, token?: string) => app.inject({ method: "GET", url, ...(token ? { headers: auth(token) } : {}) });

  /** A manager with a dashboard password, assigned to `branchId`. */
  async function addManager(accountId: string, branchId: string | null, email: string) {
    const { rows } = await pool.query(
      `INSERT INTO users (account_id, name, email, password_hash, role) VALUES ($1, 'Manager', $2, $3, 'MANAGER') RETURNING id`,
      [accountId, email, await hashSecret("manager password 1")],
    );
    if (branchId) await pool.query("INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)", [rows[0].id, branchId]);
    const login = await post("/v1/auth/login", { email, password: "manager password 1" });
    return login.json().token as string;
  }

  describe("owner sign-up and sign-in", () => {
    it("signs up a restaurant and signs the owner in", async () => {
      const r = await signup(app);
      const me = await get("/v1/me", r.token);
      expect(me.json()).toMatchObject({ role: "OWNER", accountId: r.accountId, branches: [{ id: r.branchId, name: "Ari" }] });
    });

    it("refuses a duplicate email (any case) and a short password", async () => {
      const payload = { accountName: "A", branchName: "B", ownerName: "C", email: "dup@example.com", password: "long enough pw" };
      expect((await post("/v1/signup", payload)).statusCode).toBe(201);
      expect((await post("/v1/signup", { ...payload, email: "DUP@example.com" })).statusCode).toBe(409);
      expect((await post("/v1/signup", { ...payload, email: "new@example.com", password: "short" })).statusCode).toBe(400);
    });

    it("signs in with the right password only, with one message for every failure", async () => {
      await post("/v1/signup", { accountName: "A", branchName: "B", ownerName: "C", email: "login@example.com", password: "right password" });
      const ok = await post("/v1/auth/login", { email: "LOGIN@example.com", password: "right password" });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().token).toMatch(/^[\w-]{43}$/);

      const wrong = await post("/v1/auth/login", { email: "login@example.com", password: "wrong password" });
      const unknown = await post("/v1/auth/login", { email: "nobody@example.com", password: "wrong password" });
      expect([wrong.statusCode, unknown.statusCode]).toEqual([401, 401]);
      expect(wrong.json()).toEqual(unknown.json());
    });

    it("signs out: the token stops working", async () => {
      const r = await signup(app);
      expect((await post("/v1/auth/logout", undefined, r.token)).statusCode).toBe(204);
      expect((await get("/v1/me", r.token)).statusCode).toBe(401);
    });

    it("stores only hashes of passwords and tokens", async () => {
      const r = await signup(app);
      const { rows } = await pool.query("SELECT password_hash FROM users WHERE id = $1", [r.userId]);
      expect(rows[0].password_hash).toMatch(/^scrypt\$16384\$8\$1\$/);
      const sessions = await pool.query("SELECT token_hash FROM user_sessions WHERE user_id = $1", [r.userId]);
      expect(sessions.rows[0].token_hash).not.toContain(r.token);
    });
  });

  describe("device pairing", () => {
    it("pairs tablets with one-time codes and gives them hub priorities in order", async () => {
      const r = await signup(app);
      const first = await pairDevice(app, r.token, r.branchId, "POS 1");
      const second = await pairDevice(app, r.token, r.branchId, "POS 2");
      expect([first.device.hubPriority, second.device.hubPriority]).toEqual([0, 1]);
      expect(first.device.branchId).toBe(r.branchId);

      const list = await get(`/v1/branches/${r.branchId}/devices`, r.token);
      expect(list.json().devices.map((d: { name: string }) => d.name)).toEqual(["POS 1", "POS 2"]);
    });

    it("accepts a code typed in lower case without the dash, once only", async () => {
      const r = await signup(app);
      const { code } = (await post(`/v1/branches/${r.branchId}/pairing-codes`, undefined, r.token)).json();
      expect(code).toMatch(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
      const typed = code.replace("-", "").toLowerCase();
      expect((await post("/v1/devices/pair", { code: typed, name: "POS", kind: "POS" })).statusCode).toBe(201);
      expect((await post("/v1/devices/pair", { code: typed, name: "POS", kind: "POS" })).statusCode).toBe(400);
    });

    it("refuses an expired code", async () => {
      const r = await signup(app);
      const { code } = (await post(`/v1/branches/${r.branchId}/pairing-codes`, undefined, r.token)).json();
      await pool.query("UPDATE device_pairing_codes SET expires_at = now() - interval '1 second' WHERE branch_id = $1", [r.branchId]);
      expect((await post("/v1/devices/pair", { code, name: "POS", kind: "POS" })).statusCode).toBe(400);
    });

    it("never gives two tablets paired at the same moment the same hub priority", async () => {
      const r = await signup(app);
      const codes = await Promise.all(
        Array.from({ length: 6 }, async () => (await post(`/v1/branches/${r.branchId}/pairing-codes`, undefined, r.token)).json().code),
      );
      const results = await Promise.all(codes.map((code, i) => post("/v1/devices/pair", { code, name: `T${i}`, kind: "WAITER" })));
      expect(results.map((x) => x.statusCode)).toEqual(Array(6).fill(201));
      expect(results.map((x) => x.json().device.hubPriority).sort()).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it("retiring a device revokes its token and frees its hub priority", async () => {
      const r = await signup(app);
      await pairDevice(app, r.token, r.branchId, "POS 1");
      const lost = await pairDevice(app, r.token, r.branchId, "Lost tablet");
      expect((await get("/v1/devices/me/roster", lost.token)).statusCode).toBe(200);

      const del = await app.inject({ method: "DELETE", url: `/v1/branches/${r.branchId}/devices/${lost.device.id}`, headers: auth(r.token) });
      expect(del.statusCode).toBe(204);
      expect((await get("/v1/devices/me/roster", lost.token)).statusCode).toBe(401);
      expect((await pairDevice(app, r.token, r.branchId, "Replacement")).device.hubPriority).toBe(1);
    });

    it("keeps device and person tokens apart", async () => {
      const r = await signup(app);
      const d = await pairDevice(app, r.token, r.branchId);
      expect((await get("/v1/me", d.token)).statusCode).toBe(401);
      expect((await post(`/v1/branches/${r.branchId}/pairing-codes`, undefined, d.token)).statusCode).toBe(401);
      expect((await get("/v1/devices/me/roster", r.token)).statusCode).toBe(401);
    });
  });

  describe("branch access and permissions", () => {
    it("hides other restaurants' branches", async () => {
      const a = await signup(app);
      const b = await signup(app);
      const res = await post(`/v1/branches/${a.branchId}/pairing-codes`, undefined, b.token);
      expect(res.statusCode).toBe(404);
    });

    it("limits a manager to assigned branches", async () => {
      const r = await signup(app);
      const other = await pool.query("INSERT INTO branches (account_id, name) VALUES ($1, 'Thonglor') RETURNING id", [r.accountId]);
      const manager = await addManager(r.accountId, r.branchId, "mgr1@example.com");
      expect((await post(`/v1/branches/${r.branchId}/pairing-codes`, undefined, manager)).statusCode).toBe(201);
      expect((await post(`/v1/branches/${other.rows[0].id}/pairing-codes`, undefined, manager)).statusCode).toBe(404);
      const me = await get("/v1/me", manager);
      expect(me.json().branches.map((b: { id: string }) => b.id)).toEqual([r.branchId]);
    });

    it("applies the owner's permission overrides, but never to the owner", async () => {
      const r = await signup(app);
      const manager = await addManager(r.accountId, r.branchId, "mgr2@example.com");
      await pool.query(
        `INSERT INTO role_permissions (account_id, role, permission, grant_level)
         VALUES ($1, 'MANAGER', 'MANAGE_DEVICES', 'DENY'), ($1, 'OWNER', 'MANAGE_DEVICES', 'DENY')`,
        [r.accountId],
      );
      expect((await post(`/v1/branches/${r.branchId}/pairing-codes`, undefined, manager)).statusCode).toBe(403);
      expect((await post(`/v1/branches/${r.branchId}/pairing-codes`, undefined, r.token)).statusCode).toBe(201);
    });

    it("gives every role a grant for every permission, following the spec table", () => {
      expect(DEFAULT_GRANTS.CASHIER.DISCOUNT_OR_VOID).toBe("APPROVAL");
      expect(DEFAULT_GRANTS.WAITER.TAKE_PAYMENT).toBe("DENY"); // spec: Optional
      expect(DEFAULT_GRANTS.MANAGER.EDIT_MENU).toBe("DENY"); // spec: Optional
      expect(DEFAULT_GRANTS.KITCHEN.TAKE_ORDERS).toBe("DENY");
      expect(DEFAULT_GRANTS.MANAGER.REFUND).toBe("ALLOW");
      for (const grants of Object.values(DEFAULT_GRANTS)) expect(Object.keys(grants)).toHaveLength(10);
    });
  });

  describe("staff PINs", () => {
    it("adds staff with a PIN and sends hashes, never PINs, to the branch's devices", async () => {
      const r = await signup(app);
      const res = await post(`/v1/branches/${r.branchId}/staff`, { name: "Nok", role: "CASHIER", pin: "4821" }, r.token);
      expect(res.statusCode).toBe(201);

      const d = await pairDevice(app, r.token, r.branchId);
      const roster = (await get("/v1/devices/me/roster", d.token)).json();
      expect(roster.branchId).toBe(r.branchId);
      const nok = roster.staff.find((s: { name: string }) => s.name === "Nok");
      expect(nok.role).toBe("CASHIER");
      expect(nok.pinHash).not.toContain("4821");
      expect(await verifySecret("4821", nok.pinHash)).toBe(true);
      expect(await verifySecret("4822", nok.pinHash)).toBe(false);
      expect(roster.permissions.CASHIER.DISCOUNT_OR_VOID).toBe("APPROVAL");
    });

    it("keeps each branch's roster to its own staff", async () => {
      const r = await signup(app);
      const other = await pool.query("INSERT INTO branches (account_id, name) VALUES ($1, 'Thonglor') RETURNING id", [r.accountId]);
      await post(`/v1/branches/${other.rows[0].id}/staff`, { name: "Elsewhere", role: "WAITER", pin: "1111" }, r.token);
      const d = await pairDevice(app, r.token, r.branchId);
      const roster = (await get("/v1/devices/me/roster", d.token)).json();
      expect(roster.staff.map((s: { name: string }) => s.name)).not.toContain("Elsewhere");
    });

    it("validates PINs and stops managers from adding managers", async () => {
      const r = await signup(app);
      expect((await post(`/v1/branches/${r.branchId}/staff`, { name: "X", role: "WAITER", pin: "12" }, r.token)).statusCode).toBe(400);
      expect((await post(`/v1/branches/${r.branchId}/staff`, { name: "X", role: "OWNER", pin: "1234" }, r.token)).statusCode).toBe(400);
      const manager = await addManager(r.accountId, r.branchId, "mgr3@example.com");
      expect((await post(`/v1/branches/${r.branchId}/staff`, { name: "M", role: "MANAGER", pin: "1234" }, manager)).statusCode).toBe(403);
      expect((await post(`/v1/branches/${r.branchId}/staff`, { name: "W", role: "WAITER", pin: "1234" }, manager)).statusCode).toBe(201);
    });

    it("does not let PIN-only staff sign in to the dashboard", async () => {
      const r = await signup(app);
      await pool.query(
        "INSERT INTO users (account_id, name, email, password_hash, pin_hash, role) VALUES ($1, 'Cashier', 'cashier@example.com', $2, $2, 'CASHIER')",
        [r.accountId, await hashSecret("cashier password")],
      );
      expect((await post("/v1/auth/login", { email: "cashier@example.com", password: "cashier password" })).statusCode).toBe(401);
    });
  });
});

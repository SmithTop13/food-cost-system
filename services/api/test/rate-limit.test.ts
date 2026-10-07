import pg from "pg";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { DATABASE_URL, setup, signup } from "./helpers.js";

describe.skipIf(!DATABASE_URL)("rate limits", () => {
  let pool: pg.Pool;
  let app: FastifyInstance;

  beforeAll(async () => {
    ({ pool, app } = await setup());
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
  });

  let ip = 0;
  const freshIp = () => `192.0.2.${++ip}`;
  const login = (email: string, password: string, remoteAddress: string, target = app) =>
    target.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password }, remoteAddress });

  async function owner() {
    const email = `rl-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    await app.inject({
      method: "POST",
      url: "/v1/signup",
      remoteAddress: freshIp(),
      payload: { accountName: "A", branchName: "B", ownerName: "C", email, password: "right password" },
    });
    return email;
  }

  it("locks an email after 5 wrong passwords, even for the right one, and says when to retry", async () => {
    const email = await owner();
    const addr = freshIp();
    for (let i = 0; i < 5; i++) expect((await login(email, "wrong password", addr)).statusCode).toBe(401);
    const locked = await login(email, "right password", freshIp()); // a new address does not help
    expect(locked.statusCode).toBe(429);
    expect(Number(locked.headers["retry-after"])).toBeGreaterThan(0);
    expect(Number(locked.headers["retry-after"])).toBeLessThanOrEqual(15 * 60);
  });

  it("unlocks once the window has passed", async () => {
    const email = await owner();
    const addr = freshIp();
    for (let i = 0; i < 5; i++) await login(email, "wrong password", addr);
    expect((await login(email, "right password", addr)).statusCode).toBe(429);
    await pool.query("UPDATE rate_limits SET window_start = now() - interval '16 minutes' WHERE key = $1", [`login:email:${email}`]);
    expect((await login(email, "right password", addr)).statusCode).toBe(200);
  });

  it("resets an email's count after a successful sign-in", async () => {
    const email = await owner();
    const addr = freshIp();
    for (let i = 0; i < 4; i++) await login(email, "wrong password", addr);
    expect((await login(email, "right password", addr)).statusCode).toBe(200);
    for (let i = 0; i < 4; i++) expect((await login(email, "wrong password", addr)).statusCode).toBe(401);
  });

  it("limits one address guessing across many accounts", async () => {
    const addr = freshIp();
    for (let i = 0; i < 30; i++) {
      expect((await login(`nobody${i}@example.com`, "wrong password", addr)).statusCode).toBe(401);
    }
    expect((await login("nobody-else@example.com", "wrong password", addr)).statusCode).toBe(429);
    expect((await login("nobody-else@example.com", "wrong password", freshIp())).statusCode).toBe(401);
  });

  it("limits wrong pairing codes per address, without blocking other addresses", async () => {
    const r = await signup(app);
    const addr = freshIp();
    const pair = (code: string, remoteAddress: string) =>
      app.inject({ method: "POST", url: "/v1/devices/pair", payload: { code, name: "T", kind: "POS" }, remoteAddress });
    for (let i = 0; i < 10; i++) expect((await pair("AAAA-AAAA", addr)).statusCode).toBe(400);

    const code = (
      await app.inject({ method: "POST", url: `/v1/branches/${r.branchId}/pairing-codes`, headers: { authorization: `Bearer ${r.token}` } })
    ).json().code;
    expect((await pair(code, addr)).statusCode).toBe(429); // even a valid code, from the guessing address
    expect((await pair(code, freshIp())).statusCode).toBe(201);
  });

  it("limits sign-ups per address", async () => {
    const addr = freshIp();
    const attempt = (i: number) =>
      app.inject({
        method: "POST",
        url: "/v1/signup",
        remoteAddress: addr,
        payload: { accountName: "A", branchName: "B", ownerName: "C", email: `su${ip}-${i}@example.com`, password: "long enough pw" },
      });
    for (let i = 0; i < 10; i++) expect((await attempt(i)).statusCode).toBe(201);
    expect((await attempt(10)).statusCode).toBe(429);
  });

  it("uses X-Forwarded-For only from a trusted proxy", async () => {
    const email = await owner();
    const viaProxy = buildApp(pool, { trustProxy: "127.0.0.1" });
    const fromProxy = (clientIp: string, password = "wrong password") =>
      viaProxy.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: { email: `x-${clientIp}@example.com`, password },
        remoteAddress: "127.0.0.1",
        headers: { "x-forwarded-for": clientIp },
      });
    for (let i = 0; i < 30; i++) await fromProxy("198.51.100.7");
    expect((await fromProxy("198.51.100.7")).statusCode).toBe(429);
    expect((await fromProxy("198.51.100.8")).statusCode).toBe(401); // another user behind the same proxy

    // Not trusted: a caller cannot dodge the limit by inventing X-Forwarded-For.
    const addr = freshIp();
    for (let i = 0; i < 5; i++) await login(email, "wrong password", addr);
    const spoofed = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "spoof@example.com", password: "x" },
      remoteAddress: addr,
      headers: { "x-forwarded-for": "203.0.113.99" },
    });
    expect(spoofed.statusCode).toBe(401);
    const rows = await pool.query("SELECT key FROM rate_limits WHERE key LIKE 'login:ip:203.0.113.99'");
    expect(rows.rowCount).toBe(0);
    await viaProxy.close();
  });
});

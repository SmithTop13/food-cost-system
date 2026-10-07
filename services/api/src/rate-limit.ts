import type pg from "pg";
import { HttpError } from "./context.js";

export interface Limit {
  max: number;
  windowSeconds: number;
}

export const LIMITS = {
  /** Wrong passwords for one email: protects one account from guessing. */
  loginPerEmail: { max: 5, windowSeconds: 15 * 60 },
  /** Wrong passwords from one address: slows guessing across many accounts. */
  loginPerIp: { max: 30, windowSeconds: 15 * 60 },
  /** Wrong pairing codes from one address (codes are ~40 bits, single use, 15 min). */
  pairPerIp: { max: 10, windowSeconds: 15 * 60 },
  /** Sign-ups from one address. */
  signupPerIp: { max: 10, windowSeconds: 60 * 60 },
} satisfies Record<string, Limit>;

export class RateLimitError extends HttpError {
  constructor(readonly retryAfterSeconds: number) {
    super(429, "too many attempts, try again later");
  }
}

/** Throws RateLimitError if `key` already used up its attempts in the current window. */
export async function assertNotLimited(pool: pg.Pool, key: string, limit: Limit): Promise<void> {
  const { rows } = await pool.query(
    `SELECT count, ceil(extract(epoch FROM window_start + make_interval(secs => $2) - now()))::int AS retry
       FROM rate_limits WHERE key = $1 AND window_start > now() - make_interval(secs => $2)`,
    [key, limit.windowSeconds],
  );
  if (rows[0] && rows[0].count >= limit.max) throw new RateLimitError(Math.max(1, rows[0].retry));
}

/** Count one attempt against `key`; a new window starts once the old one has passed. */
export async function recordAttempt(pool: pg.Pool, key: string, limit: Limit): Promise<void> {
  await pool.query(
    `INSERT INTO rate_limits (key, window_start, count) VALUES ($1, now(), 1)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start <= now() - make_interval(secs => $2) THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.window_start <= now() - make_interval(secs => $2) THEN now() ELSE rate_limits.window_start END`,
    [key, limit.windowSeconds],
  );
}

export async function clearAttempts(pool: pg.Pool, key: string): Promise<void> {
  await pool.query("DELETE FROM rate_limits WHERE key = $1", [key]);
}

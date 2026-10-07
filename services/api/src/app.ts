import Fastify, { type FastifyInstance } from "fastify";
import type pg from "pg";
import { HttpError } from "./context.js";
import { RateLimitError } from "./rate-limit.js";
import { authRoutes } from "./routes/auth.js";
import { deviceRoutes } from "./routes/devices.js";
import { logRoutes } from "./routes/log.js";
import { menuRoutes } from "./routes/menu.js";
import { staffRoutes } from "./routes/staff.js";

export interface AppOptions {
  /**
   * Which proxies to trust for the client address (X-Forwarded-For), e.g. the dashboard
   * server's address. Rate limits are per client address, so without this every dashboard
   * user would share one limit. A comma-separated list of addresses or CIDR ranges, or `true`
   * to trust any proxy (only when the API is not reachable directly). Default: trust none.
   */
  trustProxy?: boolean | string;
}

export function buildApp(pool: pg.Pool, options: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false, trustProxy: options.trustProxy ?? false });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof RateLimitError) reply.header("retry-after", String(error.retryAfterSeconds));
    if (error instanceof HttpError) return reply.code(error.statusCode).send({ error: error.message });
    // Fastify's own client errors (validation 400, body too large 413, bad content type 415).
    const { statusCode, message } = error as { statusCode?: number; message?: string };
    if (statusCode && statusCode >= 400 && statusCode < 500) return reply.code(statusCode).send({ error: message });
    app.log.error(error);
    return reply.code(500).send({ error: "internal error" });
  });

  app.get("/health", async () => {
    await pool.query("SELECT 1");
    return { status: "ok" };
  });

  authRoutes(app, pool);
  deviceRoutes(app, pool);
  staffRoutes(app, pool);
  logRoutes(app, pool);
  menuRoutes(app, pool);
  return app;
}

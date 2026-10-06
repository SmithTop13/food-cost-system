import Fastify, { type FastifyInstance } from "fastify";
import type pg from "pg";
import { HttpError } from "./context.js";
import { authRoutes } from "./routes/auth.js";
import { deviceRoutes } from "./routes/devices.js";
import { logRoutes } from "./routes/log.js";
import { menuRoutes } from "./routes/menu.js";
import { staffRoutes } from "./routes/staff.js";

export function buildApp(pool: pg.Pool): FastifyInstance {
  const app = Fastify({ logger: false });

  app.setErrorHandler((error, _request, reply) => {
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

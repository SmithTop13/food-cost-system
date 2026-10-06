import Fastify, { type FastifyInstance } from "fastify";
import type pg from "pg";
import type { Message } from "@fcs/sync-core";
import { LogStore } from "./log-store.js";

type Upload = Extract<Message, { kind: "UPLOAD" }>;

const ballotSchema = {
  type: "object",
  required: ["term", "rank"],
  properties: { term: { type: "integer", minimum: 1 }, rank: { type: "integer", minimum: 0 } },
} as const;

const uploadSchema = {
  type: "object",
  required: ["kind", "from", "ballot", "startIndex", "entries"],
  properties: {
    kind: { const: "UPLOAD" },
    from: { type: "string", minLength: 1 },
    ballot: ballotSchema,
    startIndex: { type: "integer", minimum: 0 },
    entries: {
      type: "array",
      maxItems: 500,
      items: {
        type: "object",
        required: ["index", "ballot", "event", "status"],
        properties: {
          index: { type: "integer", minimum: 0 },
          ballot: ballotSchema,
          status: { enum: ["ACCEPTED", "REJECTED"] },
          reason: { type: "string" },
          event: {
            type: "object",
            required: ["id", "deviceId", "createdAt", "type", "payload"],
            properties: {
              id: { type: "string", pattern: "^[0-9A-HJKMNP-TV-Z]{26}$" },
              deviceId: { type: "string", minLength: 1 },
              staffId: { type: "string" },
              createdAt: { type: "number" },
              type: { type: "string", minLength: 1 },
              payload: {},
            },
          },
        },
      },
    },
  },
} as const;

export function buildApp(pool: pg.Pool): FastifyInstance {
  const app = Fastify({ logger: false });
  const logs = new LogStore(pool);

  app.get("/health", async () => {
    await pool.query("SELECT 1");
    return { status: "ok" };
  });

  // TODO(S1): authenticate the device token and check it belongs to this branch before accepting uploads.
  app.post<{ Params: { branchId: string }; Body: Upload }>(
    "/v1/branches/:branchId/log/upload",
    { schema: { params: { type: "object", properties: { branchId: { type: "string", format: "uuid" } } }, body: uploadSchema } },
    async (request, reply) => {
      const upload = request.body;
      const misplaced = upload.entries.findIndex((e, i) => e.index !== upload.startIndex + i);
      if (misplaced >= 0) {
        return reply.code(400).send({ error: `entry ${misplaced} has index ${upload.entries[misplaced]!.index}, expected ${upload.startIndex + misplaced}` });
      }
      return logs.upload(request.params.branchId, upload);
    },
  );

  app.get<{ Params: { branchId: string }; Querystring: { from?: number; limit?: number } }>(
    "/v1/branches/:branchId/log",
    {
      schema: {
        params: { type: "object", properties: { branchId: { type: "string", format: "uuid" } } },
        querystring: {
          type: "object",
          properties: { from: { type: "integer", minimum: 0 }, limit: { type: "integer", minimum: 1, maximum: 500 } },
        },
      },
    },
    async (request) => ({ entries: await logs.entries(request.params.branchId, request.query.from, request.query.limit) }),
  );

  return app;
}

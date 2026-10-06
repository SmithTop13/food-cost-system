import type { FastifyInstance } from "fastify";
import type pg from "pg";
import type { Message } from "@fcs/sync-core";
import { findPrincipal, HttpError, requireBranchPermission, requireDevice } from "../context.js";
import { LogStore } from "../log-store.js";

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

const branchParams = { type: "object", properties: { branchId: { type: "string", format: "uuid" } } } as const;

export function logRoutes(app: FastifyInstance, pool: pg.Pool): void {
  const logs = new LogStore(pool);

  // Only a paired device of this branch may upload its log, and only as itself.
  app.post<{ Params: { branchId: string }; Body: Upload }>(
    "/v1/branches/:branchId/log/upload",
    { schema: { params: branchParams, body: uploadSchema } },
    async (request) => {
      const device = await requireDevice(pool, request);
      const upload = request.body;
      if (device.branchId !== request.params.branchId) throw new HttpError(403, "device belongs to another branch");
      if (upload.from !== device.id) throw new HttpError(403, "upload must come from the signed-in device");
      const misplaced = upload.entries.findIndex((e, i) => e.index !== upload.startIndex + i);
      if (misplaced >= 0) {
        throw new HttpError(400, `entry ${misplaced} has index ${upload.entries[misplaced]!.index}, expected ${upload.startIndex + misplaced}`);
      }
      return logs.upload(request.params.branchId, upload);
    },
  );

  // Readable by the branch's own devices, and by staff allowed to see that branch's reports.
  app.get<{ Params: { branchId: string }; Querystring: { from?: number; limit?: number } }>(
    "/v1/branches/:branchId/log",
    {
      schema: {
        params: branchParams,
        querystring: {
          type: "object",
          properties: { from: { type: "integer", minimum: 0 }, limit: { type: "integer", minimum: 1, maximum: 500 } },
        },
      },
    },
    async (request) => {
      const principal = await findPrincipal(pool, request);
      if (!principal) throw new HttpError(401, "sign in required");
      if (principal.kind === "device") {
        if (principal.branchId !== request.params.branchId) throw new HttpError(404, "branch not found");
      } else {
        await requireBranchPermission(pool, principal, request.params.branchId, "SEE_REPORTS_BRANCH", "SEE_REPORTS_ALL");
      }
      return { entries: await logs.entries(request.params.branchId, request.query.from, request.query.limit) };
    },
  );
}

import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { HttpError, requireAccountPermission, requireBranchPermission, requireDevice, requireUser } from "../context.js";
import { withTransaction } from "../db.js";

const uuid = { type: "string", format: "uuid" } as const;
const nameTh = { type: "string", minLength: 1, maxLength: 120 } as const;
const nameEn = { type: ["string", "null"], maxLength: 120 } as const;
const satang = { type: "integer", minimum: 0, maximum: 100_000_000 } as const; // up to 1,000,000 THB
const sort = { type: "integer", minimum: 0, maximum: 100_000 } as const;
const idParams = { type: "object", properties: { id: uuid } } as const;

const optionSchema = {
  type: "object",
  required: ["nameTh", "price"],
  additionalProperties: false,
  properties: { nameTh, nameEn, price: satang },
} as const;

const groupBody = {
  type: "object",
  required: ["nameTh", "minChoices", "maxChoices", "options"],
  additionalProperties: false,
  properties: {
    nameTh,
    nameEn,
    minChoices: { type: "integer", minimum: 0, maximum: 20 },
    maxChoices: { type: "integer", minimum: 1, maximum: 20 },
    options: { type: "array", minItems: 1, maxItems: 50, items: optionSchema },
  },
} as const;

const itemProperties = {
  categoryId: { type: ["string", "null"], format: "uuid" },
  nameTh,
  nameEn,
  basePrice: satang,
  photoUrl: { type: ["string", "null"], maxLength: 500 },
  serviceChargeExempt: { type: "boolean" },
  modifierGroupIds: { type: "array", maxItems: 20, uniqueItems: true, items: uuid },
} as const;

interface ItemBody {
  categoryId?: string | null;
  nameTh?: string;
  nameEn?: string | null;
  basePrice?: number;
  photoUrl?: string | null;
  serviceChargeExempt?: boolean;
  modifierGroupIds?: string[];
}

interface GroupBody {
  nameTh: string;
  nameEn?: string | null;
  minChoices: number;
  maxChoices: number;
  options: { nameTh: string; nameEn?: string | null; price: number }[];
}

interface BranchOverride {
  branchId: string;
  /** null = use the item's base price. */
  price: number | null;
  available: boolean;
  stationId: string | null;
}

async function bumpMenuVersion(db: pg.PoolClient, accountId: string): Promise<number> {
  const { rows } = await db.query("UPDATE accounts SET menu_version = menu_version + 1 WHERE id = $1 RETURNING menu_version", [
    accountId,
  ]);
  return Number(rows[0].menu_version);
}

/** 404 unless every id belongs to the account (and is not archived). */
async function assertOwned(db: pg.PoolClient, table: "menu_categories" | "menu_items" | "modifier_groups", ids: string[], accountId: string) {
  if (ids.length === 0) return;
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM ${table} WHERE id = ANY($1::uuid[]) AND account_id = $2 AND archived_at IS NULL`,
    [ids, accountId],
  );
  if (rows[0].n !== new Set(ids).size) throw new HttpError(404, `${table.replace("menu_", "").replace("_", " ")} not found`);
}

function validateChoices(body: GroupBody) {
  if (body.maxChoices < body.minChoices) throw new HttpError(400, "maxChoices must be at least minChoices");
  if (body.minChoices > body.options.length) throw new HttpError(400, "minChoices is more than the number of options");
}

async function replaceOptions(db: pg.PoolClient, groupId: string, options: GroupBody["options"]) {
  await db.query("DELETE FROM modifier_options WHERE group_id = $1", [groupId]);
  for (const [i, o] of options.entries()) {
    await db.query("INSERT INTO modifier_options (group_id, name_th, name_en, price_satang, sort) VALUES ($1, $2, $3, $4, $5)", [
      groupId,
      o.nameTh,
      o.nameEn ?? null,
      o.price,
      i,
    ]);
  }
}

async function setItemGroups(db: pg.PoolClient, itemId: string, groupIds: string[]) {
  await db.query("DELETE FROM menu_item_modifier_groups WHERE menu_item_id = $1", [itemId]);
  for (const [i, groupId] of groupIds.entries()) {
    await db.query("INSERT INTO menu_item_modifier_groups (menu_item_id, group_id, sort) VALUES ($1, $2, $3)", [itemId, groupId, i]);
  }
}

/** The account's menu as the dashboard edits it. Prices in satang. */
async function loadMenu(db: pg.Pool | pg.PoolClient, accountId: string) {
  const [account, categories, items, groups, options, links, overrides] = await Promise.all([
    db.query("SELECT menu_version FROM accounts WHERE id = $1", [accountId]),
    db.query(
      `SELECT id, name_th AS "nameTh", name_en AS "nameEn", sort FROM menu_categories
        WHERE account_id = $1 AND archived_at IS NULL ORDER BY sort, name_th`,
      [accountId],
    ),
    db.query(
      `SELECT id, category_id AS "categoryId", name_th AS "nameTh", name_en AS "nameEn",
              base_price_satang::int AS "basePrice", photo_url AS "photoUrl",
              service_charge_exempt AS "serviceChargeExempt"
         FROM menu_items WHERE account_id = $1 AND archived_at IS NULL ORDER BY name_th`,
      [accountId],
    ),
    db.query(
      `SELECT id, name_th AS "nameTh", name_en AS "nameEn", min_choices AS "minChoices", max_choices AS "maxChoices"
         FROM modifier_groups WHERE account_id = $1 AND archived_at IS NULL ORDER BY name_th`,
      [accountId],
    ),
    db.query(
      `SELECT o.id, o.group_id AS "groupId", o.name_th AS "nameTh", o.name_en AS "nameEn", o.price_satang::int AS price
         FROM modifier_options o JOIN modifier_groups g ON g.id = o.group_id
        WHERE g.account_id = $1 ORDER BY o.sort`,
      [accountId],
    ),
    db.query(
      `SELECT l.menu_item_id AS "itemId", l.group_id AS "groupId"
         FROM menu_item_modifier_groups l JOIN menu_items i ON i.id = l.menu_item_id
        WHERE i.account_id = $1 ORDER BY l.sort`,
      [accountId],
    ),
    db.query(
      `SELECT o.menu_item_id AS "itemId", o.branch_id AS "branchId", o.price_satang::int AS price,
              o.available, o.station_id AS "stationId"
         FROM menu_item_branches o JOIN menu_items i ON i.id = o.menu_item_id
        WHERE i.account_id = $1`,
      [accountId],
    ),
  ]);

  return {
    version: Number(account.rows[0].menu_version),
    categories: categories.rows,
    items: items.rows.map((item) => ({
      ...item,
      modifierGroupIds: links.rows.filter((l) => l.itemId === item.id).map((l) => l.groupId),
      branches: overrides.rows
        .filter((o) => o.itemId === item.id)
        .map(({ itemId: _itemId, ...o }) => o as BranchOverride),
    })),
    modifierGroups: groups.rows.map((g) => ({
      ...g,
      options: options.rows.filter((o) => o.groupId === g.id).map(({ groupId: _groupId, ...o }) => o),
    })),
  };
}

export function menuRoutes(app: FastifyInstance, pool: pg.Pool): void {
  /** Account-wide menu edits need EDIT_MENU (owner always; manager if the owner allows). */
  const editor = async (request: Parameters<typeof requireUser>[1]) => {
    const user = await requireUser(pool, request);
    await requireAccountPermission(pool, user, "EDIT_MENU");
    return user;
  };

  app.get("/v1/menu", async (request) => {
    const user = await requireUser(pool, request);
    return loadMenu(pool, user.accountId);
  });

  // ---------------------------------------------------------------- categories

  app.post<{ Body: { nameTh: string; nameEn?: string | null; sort?: number } }>(
    "/v1/menu/categories",
    {
      schema: {
        body: { type: "object", required: ["nameTh"], additionalProperties: false, properties: { nameTh, nameEn, sort } },
      },
    },
    async (request, reply) => {
      const user = await editor(request);
      const { nameTh: th, nameEn: en, sort: s } = request.body;
      const id = await withTransaction(pool, async (db) => {
        const { rows } = await db.query(
          "INSERT INTO menu_categories (account_id, name_th, name_en, sort) VALUES ($1, $2, $3, $4) RETURNING id",
          [user.accountId, th, en ?? null, s ?? 0],
        );
        await bumpMenuVersion(db, user.accountId);
        return rows[0].id as string;
      });
      return reply.code(201).send({ id });
    },
  );

  app.patch<{ Params: { id: string }; Body: { nameTh?: string; nameEn?: string | null; sort?: number } }>(
    "/v1/menu/categories/:id",
    {
      schema: {
        params: idParams,
        body: { type: "object", minProperties: 1, additionalProperties: false, properties: { nameTh, nameEn, sort } },
      },
    },
    async (request, reply) => {
      const user = await editor(request);
      const b = request.body;
      await withTransaction(pool, async (db) => {
        const { rowCount } = await db.query(
          `UPDATE menu_categories
              SET name_th = coalesce($3, name_th),
                  name_en = CASE WHEN $4 THEN $5 ELSE name_en END,
                  sort = coalesce($6, sort)
            WHERE id = $1 AND account_id = $2 AND archived_at IS NULL`,
          [request.params.id, user.accountId, b.nameTh ?? null, "nameEn" in b, b.nameEn ?? null, b.sort ?? null],
        );
        if (!rowCount) throw new HttpError(404, "category not found");
        await bumpMenuVersion(db, user.accountId);
      });
      return reply.code(204).send();
    },
  );

  app.delete<{ Params: { id: string } }>("/v1/menu/categories/:id", { schema: { params: idParams } }, async (request, reply) => {
    const user = await editor(request);
    await withTransaction(pool, async (db) => {
      await assertOwned(db, "menu_categories", [request.params.id], user.accountId);
      const used = await db.query("SELECT 1 FROM menu_items WHERE category_id = $1 AND archived_at IS NULL LIMIT 1", [request.params.id]);
      if (used.rows[0]) throw new HttpError(409, "move or remove the items in this category first");
      await db.query("UPDATE menu_categories SET archived_at = now() WHERE id = $1", [request.params.id]);
      await bumpMenuVersion(db, user.accountId);
    });
    return reply.code(204).send();
  });

  // ---------------------------------------------------------------- modifier groups

  app.post<{ Body: GroupBody }>("/v1/menu/modifier-groups", { schema: { body: groupBody } }, async (request, reply) => {
    const user = await editor(request);
    validateChoices(request.body);
    const id = await withTransaction(pool, async (db) => {
      const b = request.body;
      const { rows } = await db.query(
        `INSERT INTO modifier_groups (account_id, name_th, name_en, min_choices, max_choices)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [user.accountId, b.nameTh, b.nameEn ?? null, b.minChoices, b.maxChoices],
      );
      await replaceOptions(db, rows[0].id, b.options);
      await bumpMenuVersion(db, user.accountId);
      return rows[0].id as string;
    });
    return reply.code(201).send({ id });
  });

  // Replaces the group and its options. Sold items keep their snapshot, so this is safe.
  app.put<{ Params: { id: string }; Body: GroupBody }>(
    "/v1/menu/modifier-groups/:id",
    { schema: { params: idParams, body: groupBody } },
    async (request, reply) => {
      const user = await editor(request);
      validateChoices(request.body);
      await withTransaction(pool, async (db) => {
        const b = request.body;
        const { rowCount } = await db.query(
          `UPDATE modifier_groups SET name_th = $3, name_en = $4, min_choices = $5, max_choices = $6
            WHERE id = $1 AND account_id = $2 AND archived_at IS NULL`,
          [request.params.id, user.accountId, b.nameTh, b.nameEn ?? null, b.minChoices, b.maxChoices],
        );
        if (!rowCount) throw new HttpError(404, "modifier group not found");
        await replaceOptions(db, request.params.id, b.options);
        await bumpMenuVersion(db, user.accountId);
      });
      return reply.code(204).send();
    },
  );

  app.delete<{ Params: { id: string } }>("/v1/menu/modifier-groups/:id", { schema: { params: idParams } }, async (request, reply) => {
    const user = await editor(request);
    await withTransaction(pool, async (db) => {
      await assertOwned(db, "modifier_groups", [request.params.id], user.accountId);
      await db.query("UPDATE modifier_groups SET archived_at = now() WHERE id = $1", [request.params.id]);
      await db.query("DELETE FROM menu_item_modifier_groups WHERE group_id = $1", [request.params.id]);
      await bumpMenuVersion(db, user.accountId);
    });
    return reply.code(204).send();
  });

  // ---------------------------------------------------------------- items

  app.post<{ Body: ItemBody & { nameTh: string; basePrice: number } }>(
    "/v1/menu/items",
    {
      schema: {
        body: { type: "object", required: ["nameTh", "basePrice"], additionalProperties: false, properties: itemProperties },
      },
    },
    async (request, reply) => {
      const user = await editor(request);
      const b = request.body;
      const id = await withTransaction(pool, async (db) => {
        if (b.categoryId) await assertOwned(db, "menu_categories", [b.categoryId], user.accountId);
        await assertOwned(db, "modifier_groups", b.modifierGroupIds ?? [], user.accountId);
        const { rows } = await db.query(
          `INSERT INTO menu_items (account_id, category_id, name_th, name_en, base_price_satang, photo_url, service_charge_exempt)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [user.accountId, b.categoryId ?? null, b.nameTh, b.nameEn ?? null, b.basePrice, b.photoUrl ?? null, b.serviceChargeExempt ?? false],
        );
        await setItemGroups(db, rows[0].id, b.modifierGroupIds ?? []);
        await bumpMenuVersion(db, user.accountId);
        return rows[0].id as string;
      });
      return reply.code(201).send({ id });
    },
  );

  app.patch<{ Params: { id: string }; Body: ItemBody }>(
    "/v1/menu/items/:id",
    {
      schema: {
        params: idParams,
        body: { type: "object", minProperties: 1, additionalProperties: false, properties: itemProperties },
      },
    },
    async (request, reply) => {
      const user = await editor(request);
      const b = request.body;
      await withTransaction(pool, async (db) => {
        await assertOwned(db, "menu_items", [request.params.id], user.accountId);
        if (b.categoryId) await assertOwned(db, "menu_categories", [b.categoryId], user.accountId);
        if (b.modifierGroupIds) await assertOwned(db, "modifier_groups", b.modifierGroupIds, user.accountId);
        await db.query(
          `UPDATE menu_items
              SET category_id = CASE WHEN $2 THEN $3::uuid ELSE category_id END,
                  name_th = coalesce($4, name_th),
                  name_en = CASE WHEN $5 THEN $6 ELSE name_en END,
                  base_price_satang = coalesce($7, base_price_satang),
                  photo_url = CASE WHEN $8 THEN $9 ELSE photo_url END,
                  service_charge_exempt = coalesce($10, service_charge_exempt)
            WHERE id = $1`,
          [
            request.params.id,
            "categoryId" in b,
            b.categoryId ?? null,
            b.nameTh ?? null,
            "nameEn" in b,
            b.nameEn ?? null,
            b.basePrice ?? null,
            "photoUrl" in b,
            b.photoUrl ?? null,
            b.serviceChargeExempt ?? null,
          ],
        );
        if (b.modifierGroupIds) await setItemGroups(db, request.params.id, b.modifierGroupIds);
        await bumpMenuVersion(db, user.accountId);
      });
      return reply.code(204).send();
    },
  );

  // Archived, not deleted: past orders and recipes still refer to it.
  app.delete<{ Params: { id: string } }>("/v1/menu/items/:id", { schema: { params: idParams } }, async (request, reply) => {
    const user = await editor(request);
    await withTransaction(pool, async (db) => {
      await assertOwned(db, "menu_items", [request.params.id], user.accountId);
      await db.query("UPDATE menu_items SET archived_at = now() WHERE id = $1", [request.params.id]);
      await bumpMenuVersion(db, user.accountId);
    });
    return reply.code(204).send();
  });

  // ---------------------------------------------------------------- per-branch

  // Branch price (null = base price), availability and kitchen station for one item.
  app.put<{ Params: { branchId: string; itemId: string }; Body: { price: number | null; available: boolean; stationId: string | null } }>(
    "/v1/branches/:branchId/menu/items/:itemId",
    {
      schema: {
        params: { type: "object", properties: { branchId: uuid, itemId: uuid } },
        body: {
          type: "object",
          required: ["price", "available", "stationId"],
          additionalProperties: false,
          properties: { price: { ...satang, type: ["integer", "null"] }, available: { type: "boolean" }, stationId: { type: ["string", "null"], format: "uuid" } },
        },
      },
    },
    async (request, reply) => {
      const user = await editor(request);
      const { branchId, itemId } = request.params;
      await requireBranchPermission(pool, user, branchId, "EDIT_MENU");
      const b = request.body;
      await withTransaction(pool, async (db) => {
        await assertOwned(db, "menu_items", [itemId], user.accountId);
        if (b.stationId) {
          const s = await db.query("SELECT 1 FROM stations WHERE id = $1 AND branch_id = $2 AND archived_at IS NULL", [b.stationId, branchId]);
          if (!s.rows[0]) throw new HttpError(404, "station not found in this branch");
        }
        await db.query(
          `INSERT INTO menu_item_branches (menu_item_id, branch_id, price_satang, available, station_id)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (menu_item_id, branch_id)
           DO UPDATE SET price_satang = $3, available = $4, station_id = $5`,
          [itemId, branchId, b.price, b.available, b.stationId],
        );
        await bumpMenuVersion(db, user.accountId);
      });
      return reply.code(204).send();
    },
  );

  app.get<{ Params: { branchId: string } }>(
    "/v1/branches/:branchId/stations",
    { schema: { params: { type: "object", properties: { branchId: uuid } } } },
    async (request) => {
      const user = await requireUser(pool, request);
      await requireBranchPermission(pool, user, request.params.branchId, "EDIT_MENU", "MANAGE_DEVICES");
      const { rows } = await pool.query(
        `SELECT id, name, yellow_after_s AS "yellowAfterS", red_after_s AS "redAfterS"
           FROM stations WHERE branch_id = $1 AND archived_at IS NULL ORDER BY name`,
        [request.params.branchId],
      );
      return { stations: rows };
    },
  );

  app.post<{ Params: { branchId: string }; Body: { name: string; yellowAfterS?: number; redAfterS?: number } }>(
    "/v1/branches/:branchId/stations",
    {
      schema: {
        params: { type: "object", properties: { branchId: uuid } },
        body: {
          type: "object",
          required: ["name"],
          additionalProperties: false,
          properties: {
            name: { type: "string", minLength: 1, maxLength: 60 },
            yellowAfterS: { type: "integer", minimum: 30, maximum: 7200 },
            redAfterS: { type: "integer", minimum: 60, maximum: 7200 },
          },
        },
      },
    },
    async (request, reply) => {
      const user = await requireUser(pool, request);
      await requireBranchPermission(pool, user, request.params.branchId, "EDIT_MENU");
      const { name, yellowAfterS = 600, redAfterS = 900 } = request.body;
      if (redAfterS <= yellowAfterS) throw new HttpError(400, "red must come after yellow");
      const id = await withTransaction(pool, async (db) => {
        const { rows } = await db.query(
          "INSERT INTO stations (branch_id, name, yellow_after_s, red_after_s) VALUES ($1, $2, $3, $4) RETURNING id",
          [request.params.branchId, name, yellowAfterS, redAfterS],
        );
        await bumpMenuVersion(db, user.accountId);
        return rows[0].id as string;
      });
      return reply.code(201).send({ id });
    },
  );

  // ---------------------------------------------------------------- device download

  /**
   * The branch's menu as the POS needs it: branch prices applied, unavailable items marked,
   * station for kitchen routing. Send If-None-Match to skip the download when nothing changed.
   */
  app.get("/v1/devices/me/menu", async (request, reply) => {
    const device = await requireDevice(pool, request);
    const version = await pool.query("SELECT menu_version FROM accounts WHERE id = $1", [device.accountId]);
    const etag = `"menu-${version.rows[0].menu_version}"`;
    reply.header("etag", etag);
    if (request.headers["if-none-match"] === etag) return reply.code(304).send();

    const menu = await loadMenu(pool, device.accountId);
    const stations = await pool.query(
      `SELECT id, name, yellow_after_s AS "yellowAfterS", red_after_s AS "redAfterS"
         FROM stations WHERE branch_id = $1 AND archived_at IS NULL ORDER BY name`,
      [device.branchId],
    );
    // The POS works out bills offline with these (packages/pricing_dart).
    const branch = await pool.query(
      `SELECT name, price_mode AS "priceMode", vat_rate_bp AS "vatRate", service_charge_bp AS "serviceChargeRate",
              service_charge_order_types AS "serviceChargeOrderTypes",
              json_build_object('increment', rounding_increment, 'mode', rounding_mode) AS rounding
         FROM branches WHERE id = $1`,
      [device.branchId],
    );
    const { name: branchName, ...pricing } = branch.rows[0];
    return {
      version: menu.version,
      branchId: device.branchId,
      branchName,
      pricing,
      categories: menu.categories,
      items: menu.items.map(({ branches, basePrice, ...item }) => {
        const override = (branches as BranchOverride[]).find((o) => o.branchId === device.branchId);
        return {
          ...item,
          price: override?.price ?? basePrice,
          available: override?.available ?? true,
          stationId: override?.stationId ?? null,
        };
      }),
      modifierGroups: menu.modifierGroups,
      stations: stations.rows,
    };
  });
}

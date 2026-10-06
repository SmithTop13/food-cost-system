import type pg from "pg";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashSecret } from "../src/crypto.js";
import { auth, DATABASE_URL, pairDevice, setup, signup } from "./helpers.js";

describe.skipIf(!DATABASE_URL)("menu", () => {
  let pool: pg.Pool;
  let app: FastifyInstance;

  beforeAll(async () => {
    ({ pool, app } = await setup());
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
  });

  const call = (method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, token: string, payload?: object, headers = {}) =>
    app.inject({ method, url, headers: { ...auth(token), ...headers }, ...(payload ? { payload } : {}) });

  /** A restaurant with a category, a spice-level group and one dish. */
  async function restaurantWithMenu() {
    const r = await signup(app);
    const category = (await call("POST", "/v1/menu/categories", r.token, { nameTh: "อาหารจานเดียว", nameEn: "Single dishes" })).json().id;
    const spice = (
      await call("POST", "/v1/menu/modifier-groups", r.token, {
        nameTh: "ระดับความเผ็ด",
        nameEn: "Spice level",
        minChoices: 1,
        maxChoices: 1,
        options: [
          { nameTh: "ไม่เผ็ด", nameEn: "Not spicy", price: 0 },
          { nameTh: "เผ็ดมาก", nameEn: "Very spicy", price: 0 },
        ],
      })
    ).json().id;
    const egg = (
      await call("POST", "/v1/menu/modifier-groups", r.token, {
        nameTh: "เพิ่ม",
        nameEn: "Add",
        minChoices: 0,
        maxChoices: 2,
        options: [{ nameTh: "ไข่ดาว", nameEn: "Fried egg", price: 1000 }],
      })
    ).json().id;
    const kaphrao = (
      await call("POST", "/v1/menu/items", r.token, {
        categoryId: category,
        nameTh: "ผัดกะเพราหมู",
        nameEn: "Pork kaphrao",
        basePrice: 6000,
        modifierGroupIds: [spice, egg],
      })
    ).json().id;
    return { ...r, category, spice, egg, kaphrao };
  }

  it("builds a menu with categories, modifier groups and items", async () => {
    const r = await restaurantWithMenu();
    const menu = (await call("GET", "/v1/menu", r.token)).json();
    expect(menu.categories).toEqual([{ id: r.category, nameTh: "อาหารจานเดียว", nameEn: "Single dishes", sort: 0 }]);
    expect(menu.items).toHaveLength(1);
    expect(menu.items[0]).toMatchObject({ nameTh: "ผัดกะเพราหมู", basePrice: 6000, modifierGroupIds: [r.spice, r.egg] });
    const spice = menu.modifierGroups.find((g: { id: string }) => g.id === r.spice);
    expect(spice.options.map((o: { nameEn: string }) => o.nameEn)).toEqual(["Not spicy", "Very spicy"]);
  });

  it("validates modifier choice limits", async () => {
    const r = await signup(app);
    const group = (min: number, max: number, n = 2) =>
      call("POST", "/v1/menu/modifier-groups", r.token, {
        nameTh: "x",
        minChoices: min,
        maxChoices: max,
        options: Array.from({ length: n }, (_, i) => ({ nameTh: `o${i}`, price: 0 })),
      });
    expect((await group(2, 1)).statusCode).toBe(400);
    expect((await group(3, 3, 2)).statusCode).toBe(400); // must pick more than exist
    expect((await group(0, 2)).statusCode).toBe(201);
  });

  it("edits items: partial updates, clearing a field, reordering modifier groups", async () => {
    const r = await restaurantWithMenu();
    const patch = await call("PATCH", `/v1/menu/items/${r.kaphrao}`, r.token, { basePrice: 6500, nameEn: null, modifierGroupIds: [r.egg] });
    expect(patch.statusCode).toBe(204);
    const item = (await call("GET", "/v1/menu", r.token)).json().items[0];
    expect(item).toMatchObject({ basePrice: 6500, nameEn: null, nameTh: "ผัดกะเพราหมู", categoryId: r.category, modifierGroupIds: [r.egg] });
  });

  it("refuses to use another restaurant's categories or modifier groups", async () => {
    const a = await restaurantWithMenu();
    const b = await signup(app);
    const res = await call("POST", "/v1/menu/items", b.token, { nameTh: "x", basePrice: 100, categoryId: a.category });
    expect(res.statusCode).toBe(404);
    const res2 = await call("POST", "/v1/menu/items", b.token, { nameTh: "x", basePrice: 100, modifierGroupIds: [a.spice] });
    expect(res2.statusCode).toBe(404);
    expect((await call("PATCH", `/v1/menu/items/${a.kaphrao}`, b.token, { basePrice: 1 })).statusCode).toBe(404);
  });

  it("archives items and keeps non-empty categories", async () => {
    const r = await restaurantWithMenu();
    expect((await call("DELETE", `/v1/menu/categories/${r.category}`, r.token)).statusCode).toBe(409);
    expect((await call("DELETE", `/v1/menu/items/${r.kaphrao}`, r.token)).statusCode).toBe(204);
    expect((await call("DELETE", `/v1/menu/categories/${r.category}`, r.token)).statusCode).toBe(204);
    const menu = (await call("GET", "/v1/menu", r.token)).json();
    expect([menu.items, menu.categories]).toEqual([[], []]);
    const row = await pool.query("SELECT archived_at FROM menu_items WHERE id = $1", [r.kaphrao]);
    expect(row.rows[0].archived_at).not.toBeNull(); // kept for past orders
  });

  it("lets managers edit the menu only when the owner allows it", async () => {
    const r = await signup(app);
    await pool.query(
      "INSERT INTO users (account_id, name, email, password_hash, role) VALUES ($1, 'M', 'menu-mgr@example.com', $2, 'MANAGER')",
      [r.accountId, await hashSecret("manager password")],
    );
    const token = (await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: "menu-mgr@example.com", password: "manager password" } })).json().token;
    expect((await call("POST", "/v1/menu/categories", token, { nameTh: "x" })).statusCode).toBe(403);
    await pool.query("INSERT INTO role_permissions VALUES ($1, 'MANAGER', 'EDIT_MENU', 'ALLOW')", [r.accountId]);
    expect((await call("POST", "/v1/menu/categories", token, { nameTh: "x" })).statusCode).toBe(201);
  });

  it("sends each branch's devices its own prices, availability and stations", async () => {
    const r = await restaurantWithMenu();
    const thonglor = (await pool.query("INSERT INTO branches (account_id, name) VALUES ($1, 'Thonglor') RETURNING id", [r.accountId])).rows[0].id;
    const wok = (await call("POST", `/v1/branches/${thonglor}/stations`, r.token, { name: "Wok", yellowAfterS: 300, redAfterS: 600 })).json().id;
    const put = await call("PUT", `/v1/branches/${thonglor}/menu/items/${r.kaphrao}`, r.token, { price: 7500, available: false, stationId: wok });
    expect(put.statusCode).toBe(204);

    const ari = await pairDevice(app, r.token, r.branchId, "Ari POS");
    const tl = await pairDevice(app, r.token, thonglor, "Thonglor POS");
    const ariMenu = (await call("GET", "/v1/devices/me/menu", ari.token)).json();
    const tlMenu = (await call("GET", "/v1/devices/me/menu", tl.token)).json();

    expect(ariMenu.items[0]).toMatchObject({ id: r.kaphrao, price: 6000, available: true, stationId: null });
    expect(ariMenu.stations).toEqual([]);
    expect(tlMenu.items[0]).toMatchObject({ id: r.kaphrao, price: 7500, available: false, stationId: wok });
    expect(tlMenu.stations).toEqual([{ id: wok, name: "Wok", yellowAfterS: 300, redAfterS: 600 }]);
    expect(tlMenu.items[0]).not.toHaveProperty("branches"); // other branches' settings stay private
    expect(tlMenu.modifierGroups).toHaveLength(2);
  });

  it("refuses a station from another branch and red before yellow", async () => {
    const r = await restaurantWithMenu();
    const other = (await pool.query("INSERT INTO branches (account_id, name) VALUES ($1, 'B2') RETURNING id", [r.accountId])).rows[0].id;
    const station = (await call("POST", `/v1/branches/${other}/stations`, r.token, { name: "Grill" })).json().id;
    const res = await call("PUT", `/v1/branches/${r.branchId}/menu/items/${r.kaphrao}`, r.token, { price: null, available: true, stationId: station });
    expect(res.statusCode).toBe(404);
    expect((await call("POST", `/v1/branches/${r.branchId}/stations`, r.token, { name: "x", yellowAfterS: 600, redAfterS: 300 })).statusCode).toBe(400);
  });

  it("lets devices skip the download when the menu has not changed", async () => {
    const r = await restaurantWithMenu();
    const d = await pairDevice(app, r.token, r.branchId);
    const first = await call("GET", "/v1/devices/me/menu", d.token);
    const etag = first.headers["etag"] as string;
    expect(etag).toMatch(/^"menu-\d+"$/);
    expect((await call("GET", "/v1/devices/me/menu", d.token, undefined, { "if-none-match": etag })).statusCode).toBe(304);

    await call("PATCH", `/v1/menu/items/${r.kaphrao}`, r.token, { basePrice: 7000 });
    const changed = await call("GET", "/v1/devices/me/menu", d.token, undefined, { "if-none-match": etag });
    expect(changed.statusCode).toBe(200);
    expect(changed.headers["etag"]).not.toBe(etag);
    expect(changed.json().items[0].price).toBe(7000);
  });

  it("lists branch staff without PIN hashes", async () => {
    const r = await signup(app);
    await call("POST", `/v1/branches/${r.branchId}/staff`, r.token, { name: "Nok", role: "CASHIER", pin: "4821" });
    const res = await call("GET", `/v1/branches/${r.branchId}/staff`, r.token);
    expect(res.json().staff).toEqual([{ id: expect.any(String), name: "Nok", role: "CASHIER", active: true }]);
  });
});

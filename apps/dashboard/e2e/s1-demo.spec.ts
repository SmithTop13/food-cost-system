import { expect, test } from "@playwright/test";
import { API_BASE } from "../playwright.config";

// Sprint S1 demo: the owner builds a menu on the web, and it appears on a tablet.
test("owner builds a menu in the dashboard; a paired device downloads it", async ({ page, request }) => {
  const email = `owner-${Date.now()}@example.com`;

  // Sign up (the dashboard opens in Thai), then switch to English.
  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "สร้างร้านใหม่" })).toBeVisible();
  await page.getByRole("button", { name: "Language" }).click();
  await page.getByLabel("Restaurant name").fill("Baan Kaphrao");
  await page.getByLabel("First branch name").fill("Ari");
  await page.getByLabel("Your name").fill("Somchai");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create a restaurant" }).click();

  await expect(page).toHaveURL(/\/menu$/);
  await expect(page.getByText("No items yet")).toBeVisible();

  // Category.
  const categoryForm = page.getByRole("form", { name: "Add category" });
  await categoryForm.getByLabel("Name (Thai)").fill("อาหารจานเดียว");
  await categoryForm.getByLabel("Name (English)").fill("Single dishes");
  await categoryForm.getByRole("button", { name: "Add category" }).click();
  await expect(categoryForm.getByText("Single dishes")).toBeVisible();

  // Modifier group.
  const groupForm = page.getByRole("form", { name: "Add modifier group" });
  await groupForm.getByLabel("Name (Thai)").fill("ระดับความเผ็ด");
  await groupForm.getByLabel("Name (English)").fill("Spice level");
  await groupForm.getByLabel("Min choices").fill("1");
  await groupForm.getByLabel("Max choices").fill("1");
  await groupForm.getByLabel(/One option per line/).fill("Mild, 0\nThai hot, 0\nExtra chilli, 5");
  await groupForm.getByRole("button", { name: "Add modifier group" }).click();
  await expect(groupForm.getByText("Extra chilli +5.00")).toBeVisible();

  // Item with the modifier group.
  const itemForm = page.getByRole("form", { name: "Add item" });
  await itemForm.getByLabel("Name (Thai)").fill("ผัดกะเพราหมู");
  await itemForm.getByLabel("Name (English)").fill("Pork kaphrao");
  await itemForm.getByLabel("Price (THB)").fill("60");
  await itemForm.getByLabel("Spice level").check();
  await itemForm.getByRole("button", { name: "Add item" }).click();

  const row = page.getByRole("row", { name: /Pork kaphrao/ });
  await expect(row).toContainText("60.00");
  await expect(row).toContainText("+ Spice level");

  // A bad price is refused with a message, nothing is saved.
  const branchPrice = page.getByLabel("Price at this branch: Pork kaphrao");
  await branchPrice.fill("abc");
  await branchPrice.press("Enter");
  // (Next.js also renders an empty role="alert" route announcer, so match by text.)
  await expect(page.getByRole("alert").filter({ hasText: "Enter a price like 60 or 60.50" })).toBeVisible();

  // Branch price 65 and sold out at this branch.
  await branchPrice.fill("65");
  await branchPrice.press("Enter");
  await expect(branchPrice).toHaveValue("65.00");
  await page.getByRole("button", { name: "On sale: Pork kaphrao" }).click();
  await expect(row.getByText("Sold out")).toBeVisible();

  // Staff with a PIN.
  await page.getByRole("link", { name: "Staff" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Staff" })).toBeVisible(); // wait for the page to switch
  await page.getByLabel("Name", { exact: true }).fill("Nok");
  await page.getByLabel("Role").selectOption("CASHIER");
  await page.getByLabel("PIN (4–6 digits)").fill("4821");
  await page.getByRole("button", { name: "Add staff" }).click();
  await expect(page.getByRole("row", { name: /Nok/ })).toContainText("Cashier");

  // Pair a tablet with the code shown on screen.
  await page.getByRole("link", { name: "Devices" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Devices" })).toBeVisible();
  await page.getByRole("button", { name: "Pair a new device" }).click();
  const code = (await page.getByTestId("pairing-code").textContent())!.trim();
  expect(code).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}$/);

  // --- the tablet's side (the POS app is not built yet, so call the API as it will) ---
  const paired = await request.post(`${API_BASE}/v1/devices/pair`, { data: { code, name: "Counter POS", kind: "POS" } });
  expect(paired.status()).toBe(201);
  const { token } = await paired.json();
  const menuRes = await request.get(`${API_BASE}/v1/devices/me/menu`, { headers: { authorization: `Bearer ${token}` } });
  expect(menuRes.status()).toBe(200);
  const menu = await menuRes.json();
  expect(menu.categories).toEqual([expect.objectContaining({ nameTh: "อาหารจานเดียว", nameEn: "Single dishes" })]);
  expect(menu.items).toEqual([
    expect.objectContaining({ nameTh: "ผัดกะเพราหมู", nameEn: "Pork kaphrao", price: 6500, available: false }),
  ]);
  expect(menu.modifierGroups[0]).toMatchObject({
    nameEn: "Spice level",
    minChoices: 1,
    maxChoices: 1,
    options: [{ nameTh: "Mild", price: 0 }, { nameTh: "Thai hot", price: 0 }, { nameTh: "Extra chilli", price: 500 }],
  });
  const roster = await (await request.get(`${API_BASE}/v1/devices/me/roster`, { headers: { authorization: `Bearer ${token}` } })).json();
  expect(roster.staff.map((s: { name: string }) => s.name)).toContain("Nok");

  // The new tablet shows up on the Devices page.
  await page.reload();
  await expect(page.getByRole("row", { name: /Counter POS/ })).toContainText("POS");

  // Sign out, then back in.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/menu$/);
  await expect(page.getByRole("row", { name: /Pork kaphrao/ })).toBeVisible();
});

test("signed-out visitors are sent to sign in, and a wrong password is refused", async ({ page }) => {
  await page.goto("/menu");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole("button", { name: "Language" }).click();
  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByLabel("Password").fill("wrong password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "wrong email or password" })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

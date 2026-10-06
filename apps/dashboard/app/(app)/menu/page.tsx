"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { localName, useI18n } from "@/lib/i18n";
import { formatBaht, parseBaht, parseOptions } from "@/lib/money";
import { useSession } from "@/lib/session";
import type { Menu, MenuItem } from "@/lib/types";

const message = (e: unknown) => (e instanceof ApiError ? e.message : String(e));

export default function MenuPage() {
  const { t, lang } = useI18n();
  const { branchId } = useSession();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMenu(await api<Menu>("GET", "/v1/menu"));
    } catch (e) {
      setError(message(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Run a change, then reload; shows the API's message on failure. */
  const change = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await load();
      return true;
    } catch (e) {
      setError(message(e));
      return false;
    }
  };

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const ok = await change(() =>
      api("POST", "/v1/menu/categories", {
        nameTh: String(form.get("nameTh")),
        nameEn: String(form.get("nameEn") || "") || null,
        sort: menu?.categories.length ?? 0,
      }),
    );
    if (ok) formEl.reset();
  }

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const basePrice = parseBaht(String(form.get("price")));
    if (basePrice === null) return setError(t.invalidPrice);
    const ok = await change(() =>
      api("POST", "/v1/menu/items", {
        nameTh: String(form.get("nameTh")),
        nameEn: String(form.get("nameEn") || "") || null,
        basePrice,
        categoryId: String(form.get("categoryId") || "") || null,
        modifierGroupIds: form.getAll("modifierGroupIds").map(String),
      }),
    );
    if (ok) formEl.reset();
  }

  async function addGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const options = parseOptions(String(form.get("options")));
    if (!options) return setError(t.optionsHint);
    const ok = await change(() =>
      api("POST", "/v1/menu/modifier-groups", {
        nameTh: String(form.get("nameTh")),
        nameEn: String(form.get("nameEn") || "") || null,
        minChoices: Number(form.get("minChoices")),
        maxChoices: Number(form.get("maxChoices")),
        options,
      }),
    );
    if (ok) formEl.reset();
  }

  function setBranch(item: MenuItem, patch: { price?: number | null; available?: boolean }) {
    const current = item.branches.find((b) => b.branchId === branchId);
    return change(() =>
      api("PUT", `/v1/branches/${branchId}/menu/items/${item.id}`, {
        price: "price" in patch ? patch.price : (current?.price ?? null),
        available: patch.available ?? current?.available ?? true,
        stationId: current?.stationId ?? null,
      }),
    );
  }

  if (!menu) return <p>{error ?? t.loading}</p>;

  const sections = [
    ...menu.categories.map((c) => ({ key: c.id, title: localName(lang, c), items: menu.items.filter((i) => i.categoryId === c.id) })),
    { key: "none", title: t.noCategory, items: menu.items.filter((i) => !i.categoryId || !menu.categories.some((c) => c.id === i.categoryId)) },
  ].filter((s) => s.items.length > 0 || s.key !== "none");

  return (
    <>
      <h1>{t.menu}</h1>
      {error && <p className="error" role="alert">{error}</p>}

      <section className="card table-wrap">
        <h2 style={{ marginTop: 0 }}>{t.items}</h2>
        {menu.items.length === 0 && <p className="empty">{t.emptyMenu}</p>}
        {sections.map((section) => (
          <div key={section.key}>
            <h2>{section.title}</h2>
            {section.items.length > 0 && (
              <table className="menu-table">
                <colgroup>
                  <col className="name" />
                  <col className="base" />
                  <col className="branch" />
                  <col className="avail" />
                  <col className="actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th>{t.items}</th>
                    <th className="num">{t.basePrice}</th>
                    <th className="num">
                      {t.branchPrice}
                      <div className="sub">{t.branchPriceHint}</div>
                    </th>
                    <th>{t.available}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {section.items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      branchId={branchId}
                      onBranch={(patch) => setBranch(item, patch)}
                      onRemove={() => change(() => api("DELETE", `/v1/menu/items/${item.id}`))}
                      onInvalid={() => setError(t.invalidPrice)}
                      modifierNames={item.modifierGroupIds
                        .map((id) => menu.modifierGroups.find((g) => g.id === id))
                        .filter((g) => g !== undefined)
                        .map((g) => localName(lang, g))}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </section>

      <form className="card form" onSubmit={addItem} aria-label={t.addItem}>
        <h2 style={{ marginTop: 0 }}>{t.addItem}</h2>
        <div className="row">
          <label>
            {t.nameTh}
            <input name="nameTh" required maxLength={120} />
          </label>
          <label>
            {t.nameEn}
            <input name="nameEn" maxLength={120} />
          </label>
          <label>
            {t.price}
            <input name="price" inputMode="decimal" required placeholder="60.00" />
          </label>
          <label>
            {t.category}
            <select name="categoryId" defaultValue={menu.categories[0]?.id ?? ""}>
              <option value="">{t.noCategory}</option>
              {menu.categories.map((c) => (
                <option key={c.id} value={c.id}>{localName(lang, c)}</option>
              ))}
            </select>
          </label>
        </div>
        {menu.modifierGroups.length > 0 && (
          <fieldset className="row" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="hint">{t.modifiers}</legend>
            {menu.modifierGroups.map((g) => (
              <label key={g.id} style={{ display: "flex", gap: 6, alignItems: "center", flex: "0 0 auto" }}>
                <input type="checkbox" name="modifierGroupIds" value={g.id} />
                {localName(lang, g)}
              </label>
            ))}
          </fieldset>
        )}
        <div>
          <button type="submit">{t.addItem}</button>
        </div>
      </form>

      <div className="row" style={{ alignItems: "start" }}>
        <form className="card form" style={{ flex: "1 1 300px" }} onSubmit={addCategory} aria-label={t.addCategory}>
          <h2 style={{ marginTop: 0 }}>{t.categories}</h2>
          {menu.categories.length > 0 && <p className="sub">{menu.categories.map((c) => localName(lang, c)).join(" · ")}</p>}
          <label>
            {t.nameTh}
            <input name="nameTh" required maxLength={120} />
          </label>
          <label>
            {t.nameEn}
            <input name="nameEn" maxLength={120} />
          </label>
          <div>
            <button type="submit">{t.addCategory}</button>
          </div>
        </form>

        <form className="card form" style={{ flex: "1 1 300px" }} onSubmit={addGroup} aria-label={t.addModifierGroup}>
          <h2 style={{ marginTop: 0 }}>{t.modifierGroups}</h2>
          {menu.modifierGroups.map((g) => (
            <p key={g.id} className="sub" style={{ margin: 0 }}>
              <strong>{localName(lang, g)}</strong> ({g.minChoices}–{g.maxChoices}):{" "}
              {g.options.map((o) => `${localName(lang, o)}${o.price ? ` +${formatBaht(o.price)}` : ""}`).join(", ")}
            </p>
          ))}
          <div className="row">
            <label>
              {t.nameTh}
              <input name="nameTh" required maxLength={120} />
            </label>
            <label>
              {t.nameEn}
              <input name="nameEn" maxLength={120} />
            </label>
          </div>
          <div className="row">
            <label>
              {t.minChoices}
              <input name="minChoices" type="number" min={0} max={20} defaultValue={0} required />
            </label>
            <label>
              {t.maxChoices}
              <input name="maxChoices" type="number" min={1} max={20} defaultValue={1} required />
            </label>
          </div>
          <label>
            <span className="hint">{t.optionsHint}</span>
            <textarea name="options" required />
          </label>
          <div>
            <button type="submit">{t.addModifierGroup}</button>
          </div>
        </form>
      </div>
    </>
  );
}

function ItemRow(props: {
  item: MenuItem;
  branchId: string | null;
  modifierNames: string[];
  onBranch: (patch: { price?: number | null; available?: boolean }) => Promise<boolean>;
  onRemove: () => void;
  onInvalid: () => void;
}) {
  const { t, lang } = useI18n();
  const { item, branchId } = props;
  const override = item.branches.find((b) => b.branchId === branchId);
  const available = override?.available ?? true;
  const [price, setPrice] = useState(override?.price == null ? "" : formatBaht(override.price));

  useEffect(() => {
    setPrice(override?.price == null ? "" : formatBaht(override.price));
  }, [override?.price, branchId]);

  async function savePrice() {
    const text = price.trim();
    const next = text === "" ? null : parseBaht(text);
    if (text !== "" && next === null) return props.onInvalid();
    if (next === (override?.price ?? null)) return;
    await props.onBranch({ price: next });
  }

  const name = localName(lang, item);
  return (
    <tr>
      <td>
        {name}
        {lang === "th" && item.nameEn && <div className="sub">{item.nameEn}</div>}
        {props.modifierNames.length > 0 && <div className="sub">+ {props.modifierNames.join(", ")}</div>}
      </td>
      <td className="num">{formatBaht(item.basePrice)}</td>
      <td className="num">
        <input
          className="price"
          aria-label={`${t.branchPrice}: ${name}`}
          value={price}
          placeholder={formatBaht(item.basePrice)}
          inputMode="decimal"
          onChange={(e) => setPrice(e.target.value)}
          onBlur={savePrice}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        />
      </td>
      <td>
        <button
          type="button"
          className="secondary"
          aria-pressed={available}
          aria-label={`${t.available}: ${name}`}
          onClick={() => props.onBranch({ available: !available })}
        >
          <span className={`pill ${available ? "ok" : "off"}`}>{available ? t.available : t.soldOut}</span>
        </button>
      </td>
      <td className="num">
        <button type="button" className="danger" onClick={props.onRemove}>{t.remove}</button>
      </td>
    </tr>
  );
}

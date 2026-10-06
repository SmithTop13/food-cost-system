import { allocate, type Satang } from "./money.js";
import type { OrderTotals, PricingSettings, RoundingIncrement } from "./totals.js";

/** Split an amount into `parts` payments, each a multiple of `increment`, summing exactly to `total`. */
export function splitEvenly(total: Satang, parts: number, increment: RoundingIncrement = 1): Satang[] {
  if (!Number.isSafeInteger(parts) || parts < 1) throw new RangeError(`parts must be a positive integer, got ${parts}`);
  if (total % increment !== 0) throw new RangeError(`total ${total} is not a multiple of increment ${increment}`);
  const units = total / increment;
  const base = Math.floor(units / parts);
  const extra = units - base * parts;
  return Array.from({ length: parts }, (_, i) => (base + (i < extra ? 1 : 0)) * increment);
}

export interface SplitGroup {
  lineIds: string[];
  net: Satang;
  serviceCharge: Satang;
  vat: Satang;
  /** Amount payable for this group. Groups sum exactly to the bill total. */
  total: Satang;
}

/**
 * Split a calculated bill by item. Every non-voided line must appear in exactly one group.
 * Service charge and VAT come from the per-line allocation in `totals`; the rounded total
 * is allocated across groups in rounding-increment units.
 */
export function splitByItems(
  totals: OrderTotals,
  groups: readonly (readonly string[])[],
  settings: Pick<PricingSettings, "priceMode" | "rounding">,
): SplitGroup[] {
  const byId = new Map(totals.lines.map((l) => [l.id, l]));
  const seen = new Set<string>();
  for (const group of groups) {
    if (group.length === 0) throw new RangeError("split groups must not be empty");
    for (const id of group) {
      if (!byId.has(id)) throw new RangeError(`unknown or voided line ${id}`);
      if (seen.has(id)) throw new RangeError(`line ${id} is in more than one group`);
      seen.add(id);
    }
  }
  if (seen.size !== byId.size) {
    const missing = [...byId.keys()].filter((id) => !seen.has(id));
    throw new RangeError(`lines not assigned to a group: ${missing.join(", ")}`);
  }

  const partial = groups.map((group) => {
    const lines = group.map((id) => byId.get(id)!);
    const net = lines.reduce((a, l) => a + l.net, 0);
    const serviceCharge = lines.reduce((a, l) => a + l.serviceCharge, 0);
    const vat = lines.reduce((a, l) => a + l.vat, 0);
    const unrounded = settings.priceMode === "VAT_EXCLUDED" ? net + serviceCharge + vat : net + serviceCharge;
    return { lineIds: [...group], net, serviceCharge, vat, unrounded };
  });

  const increment = settings.rounding.increment;
  const units = allocate(totals.total / increment, partial.map((g) => g.unrounded));
  return partial.map(({ unrounded: _unrounded, ...g }, i) => ({ ...g, total: units[i]! * increment }));
}

import { describe, expect, it } from "vitest";
import {
  allocate,
  calculateTotals,
  roundToIncrement,
  splitByItems,
  splitEvenly,
  type Discount,
  type LineInput,
  type OrderInput,
  type OrderType,
  type PricingSettings,
  type RoundingIncrement,
  type RoundingMode,
} from "../src/index.js";

/** Small deterministic PRNG so failures are reproducible from the seed. */
function rng(seed: number) {
  let s = seed >>> 0;
  return {
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(min: number, max: number) {
      return min + Math.floor(this.next() * (max - min + 1));
    },
    pick<T>(items: readonly T[]): T {
      return items[this.int(0, items.length - 1)]!;
    },
  };
}

function randomCase(seed: number): { order: OrderInput; settings: PricingSettings } {
  const r = rng(seed);
  const discount = (): Discount | undefined =>
    r.pick([
      undefined,
      undefined,
      { kind: "PERCENT", rate: r.int(0, 10000) } as Discount,
      { kind: "AMOUNT", amount: r.int(0, 50000) } as Discount,
    ]);
  const lines: LineInput[] = Array.from({ length: r.int(1, 12) }, (_, i) => ({
    id: `l${i}`,
    unitPrice: r.int(0, 150000),
    modifierPrices: Array.from({ length: r.int(0, 3) }, () => r.int(0, 3000)),
    quantity: r.int(1, 6),
    discount: discount(),
    serviceChargeExempt: r.next() < 0.15,
    voided: i > 0 && r.next() < 0.1,
  }));
  return {
    order: { orderType: r.pick<OrderType>(["DINE_IN", "TAKEAWAY", "DELIVERY"]), lines, billDiscount: discount() },
    settings: {
      priceMode: r.pick(["VAT_INCLUDED", "VAT_EXCLUDED"] as const),
      vatRate: 700,
      serviceChargeRate: r.pick([0, 500, 1000]),
      serviceChargeOrderTypes: ["DINE_IN"],
      rounding: {
        increment: r.pick<RoundingIncrement>([1, 25, 100]),
        mode: r.pick<RoundingMode>(["NEAREST", "DOWN", "UP"]),
      },
    },
  };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("invariants over 2,000 random orders", () => {
  for (let seed = 1; seed <= 2000; seed++) {
    const { order, settings } = randomCase(seed);
    const t = calculateTotals(order, settings);
    const inc = settings.rounding.increment;

    it(`seed ${seed}`, () => {
      // Line breakdowns add up to the bill.
      expect(sum(t.lines.map((l) => l.gross))).toBe(t.subtotal);
      expect(sum(t.lines.map((l) => l.itemDiscount))).toBe(t.itemDiscounts);
      expect(sum(t.lines.map((l) => l.billDiscount))).toBe(t.billDiscount);
      expect(sum(t.lines.map((l) => l.net))).toBe(t.discountedSubtotal);
      expect(sum(t.lines.map((l) => l.serviceCharge))).toBe(t.serviceCharge);
      expect(sum(t.lines.map((l) => l.vat))).toBe(t.vat);
      expect(t.lines.every((l) => l.net >= 0)).toBe(true);

      // Totals are consistent.
      expect(t.subtotal - t.itemDiscounts - t.billDiscount).toBe(t.discountedSubtotal);
      expect(t.netOfVat + t.vat).toBe(t.totalBeforeRounding);
      expect(t.total - t.totalBeforeRounding).toBe(t.roundingAdjustment);
      expect(t.total % inc).toBe(0);
      expect(Math.abs(t.roundingAdjustment)).toBeLessThan(inc);
      if (order.orderType !== "DINE_IN") expect(t.serviceCharge).toBe(0);

      // Splits always add back up to the total.
      for (const parts of [1, 2, 3, 7]) {
        const shares = splitEvenly(t.total, parts, inc);
        expect(sum(shares)).toBe(t.total);
        expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(inc);
      }
      const groups = t.lines.map((l, i) => ({ id: l.id, g: i % 3 }));
      const byGroup = [0, 1, 2].map((g) => groups.filter((x) => x.g === g).map((x) => x.id)).filter((g) => g.length);
      const split = splitByItems(t, byGroup, settings);
      expect(sum(split.map((s) => s.total))).toBe(t.total);
      expect(sum(split.map((s) => s.vat))).toBe(t.vat);
      expect(split.every((s) => s.total % inc === 0)).toBe(true);
    });
  }
});

describe("allocate", () => {
  it("sums to the total and breaks ties toward the earliest part", () => {
    expect(allocate(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(allocate(1, [1, 1])).toEqual([1, 0]);
    expect(allocate(0, [5, 7])).toEqual([0, 0]);
    expect(allocate(5, [0, 0])).toEqual([3, 2]);
  });

  it("stays exact beyond 2^53 intermediate products", () => {
    const parts = allocate(9_000_000_000_000, [3_000_000_000, 6_000_000_000]);
    expect(parts).toEqual([3_000_000_000_000, 6_000_000_000_000]);
  });
});

describe("roundToIncrement", () => {
  it.each([
    [24129, 25, "NEAREST", 24125],
    [24137, 25, "NEAREST", 24125],
    [24138, 25, "NEAREST", 24150],
    [22550, 100, "NEAREST", 22600],
    [22549, 100, "NEAREST", 22500],
    [25680, 25, "DOWN", 25675],
    [10593, 100, "UP", 10600],
    [10600, 100, "UP", 10600],
  ] as const)("%i to %i (%s) = %i", (amount, inc, mode, expected) => {
    expect(roundToIncrement(amount, inc, mode)).toBe(expected);
  });
});

describe("validation", () => {
  const base = { orderType: "TAKEAWAY" as const };
  it("rejects fractional satang, bad quantities and duplicate lines", () => {
    expect(() => calculateTotals({ ...base, lines: [{ id: "a", unitPrice: 10.5, quantity: 1 }] })).toThrow(RangeError);
    expect(() => calculateTotals({ ...base, lines: [{ id: "a", unitPrice: 100, quantity: 0 }] })).toThrow(RangeError);
    expect(() =>
      calculateTotals({
        ...base,
        lines: [
          { id: "a", unitPrice: 100, quantity: 1 },
          { id: "a", unitPrice: 100, quantity: 1 },
        ],
      }),
    ).toThrow(/duplicate/);
    expect(() =>
      calculateTotals({ ...base, lines: [{ id: "a", unitPrice: 100, quantity: 1, discount: { kind: "PERCENT", rate: 12000 } }] }),
    ).toThrow(RangeError);
  });

  it("rejects incomplete or overlapping split groups", () => {
    const t = calculateTotals({
      ...base,
      lines: [
        { id: "a", unitPrice: 100, quantity: 1 },
        { id: "b", unitPrice: 100, quantity: 1 },
      ],
    });
    const s = { priceMode: "VAT_EXCLUDED", rounding: { increment: 1, mode: "NEAREST" } } as const;
    expect(() => splitByItems(t, [["a"]], s)).toThrow(/not assigned/);
    expect(() => splitByItems(t, [["a", "b"], ["b"]], s)).toThrow(/more than one/);
    expect(() => splitByItems(t, [["a", "b", "z"]], s)).toThrow(/unknown/);
  });
});

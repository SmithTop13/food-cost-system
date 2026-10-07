import type { Discount, LineInput, OrderInput, OrderType, PricingSettings, RoundingIncrement, RoundingMode } from "../src/index.js";

/** Small deterministic PRNG so failures are reproducible from the seed. */
export function rng(seed: number) {
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

export function randomCase(seed: number): { order: OrderInput; settings: PricingSettings } {
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


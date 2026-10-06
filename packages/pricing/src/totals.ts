import {
  allocate,
  applyRate,
  assertBasisPoints,
  assertSatang,
  includedTax,
  type BasisPoints,
  type Satang,
} from "./money.js";

export type OrderType = "DINE_IN" | "TAKEAWAY" | "DELIVERY";
export type PriceMode = "VAT_INCLUDED" | "VAT_EXCLUDED";
export type RoundingIncrement = 1 | 25 | 100;
export type RoundingMode = "NEAREST" | "DOWN" | "UP";

export interface PricingSettings {
  priceMode: PriceMode;
  vatRate: BasisPoints;
  serviceChargeRate: BasisPoints;
  /** Order types that pay service charge. */
  serviceChargeOrderTypes: readonly OrderType[];
  rounding: { increment: RoundingIncrement; mode: RoundingMode };
}

export type Discount =
  | { kind: "PERCENT"; rate: BasisPoints }
  | { kind: "AMOUNT"; amount: Satang };

export interface LineInput {
  id: string;
  unitPrice: Satang;
  modifierPrices?: readonly Satang[];
  quantity: number;
  discount?: Discount;
  serviceChargeExempt?: boolean;
  voided?: boolean;
}

export interface OrderInput {
  orderType: OrderType;
  lines: readonly LineInput[];
  billDiscount?: Discount;
}

export interface LineTotals {
  id: string;
  gross: Satang;
  itemDiscount: Satang;
  billDiscount: Satang;
  /** gross − item discount − bill discount share. */
  net: Satang;
  serviceCharge: Satang;
  vat: Satang;
}

export interface OrderTotals {
  lines: LineTotals[];
  /** Sum of line gross amounts (before any discount). */
  subtotal: Satang;
  itemDiscounts: Satang;
  billDiscount: Satang;
  /** subtotal − item discounts − bill discount. */
  discountedSubtotal: Satang;
  serviceCharge: Satang;
  vat: Satang;
  /** Amount excluding VAT (discounted subtotal + service charge, minus VAT if prices include it). */
  netOfVat: Satang;
  totalBeforeRounding: Satang;
  /** Rounded total − total before rounding. Can be negative. */
  roundingAdjustment: number;
  /** Amount payable. */
  total: Satang;
}

export const DEFAULT_SETTINGS: PricingSettings = {
  priceMode: "VAT_EXCLUDED",
  vatRate: 700,
  serviceChargeRate: 1000,
  serviceChargeOrderTypes: ["DINE_IN"],
  rounding: { increment: 1, mode: "NEAREST" },
};

function discountAmount(base: Satang, discount: Discount | undefined, label: string): Satang {
  if (!discount) return 0;
  if (discount.kind === "PERCENT") {
    assertBasisPoints(discount.rate, `${label} rate`);
    return applyRate(base, discount.rate);
  }
  assertSatang(discount.amount, `${label} amount`);
  return Math.min(discount.amount, base);
}

export function roundToIncrement(amount: Satang, increment: RoundingIncrement, mode: RoundingMode): Satang {
  const units = Math.floor(amount / increment);
  const rest = amount - units * increment;
  if (rest === 0) return amount;
  switch (mode) {
    case "DOWN":
      return units * increment;
    case "UP":
      return (units + 1) * increment;
    case "NEAREST":
      return (rest * 2 >= increment ? units + 1 : units) * increment;
  }
}

function validateSettings(settings: PricingSettings): void {
  assertBasisPoints(settings.vatRate, "vatRate");
  assertBasisPoints(settings.serviceChargeRate, "serviceChargeRate");
  if (![1, 25, 100].includes(settings.rounding.increment)) {
    throw new RangeError(`unsupported rounding increment ${settings.rounding.increment}`);
  }
}

export function calculateTotals(order: OrderInput, settings: PricingSettings = DEFAULT_SETTINGS): OrderTotals {
  validateSettings(settings);
  const ids = new Set<string>();

  const active = order.lines.filter((line) => {
    if (ids.has(line.id)) throw new RangeError(`duplicate line id ${line.id}`);
    ids.add(line.id);
    return !line.voided;
  });

  // 1–2. Line gross and item discounts.
  const priced = active.map((line) => {
    assertSatang(line.unitPrice, `line ${line.id} unitPrice`);
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
      throw new RangeError(`line ${line.id} quantity must be a positive integer, got ${line.quantity}`);
    }
    const modifiers = line.modifierPrices ?? [];
    modifiers.forEach((p) => assertSatang(p, `line ${line.id} modifier price`));
    const each = line.unitPrice + modifiers.reduce((a, b) => a + b, 0);
    const gross = each * line.quantity;
    assertSatang(gross, `line ${line.id} gross`);
    const itemDiscount = discountAmount(gross, line.discount, `line ${line.id} discount`);
    return { line, gross, itemDiscount, afterItem: gross - itemDiscount };
  });

  // 3. Bill discount, allocated to lines.
  const afterItems = priced.reduce((a, p) => a + p.afterItem, 0);
  const billDiscount = discountAmount(afterItems, order.billDiscount, "bill discount");
  const billShares = allocate(billDiscount, priced.map((p) => p.afterItem));
  const nets = priced.map((p, i) => p.afterItem - billShares[i]!);
  const discountedSubtotal = afterItems - billDiscount;

  // 4. Service charge on non-exempt lines, for eligible order types.
  const chargesService = settings.serviceChargeOrderTypes.includes(order.orderType);
  const scWeights = priced.map((p, i) => (chargesService && !p.line.serviceChargeExempt ? nets[i]! : 0));
  const scBase = scWeights.reduce((a, b) => a + b, 0);
  const serviceCharge = applyRate(scBase, settings.serviceChargeRate);
  const scShares = scBase === 0 ? priced.map(() => 0) : allocate(serviceCharge, scWeights);

  // 5. VAT.
  const taxable = discountedSubtotal + serviceCharge;
  let vat: Satang;
  let totalBeforeRounding: Satang;
  if (settings.priceMode === "VAT_EXCLUDED") {
    vat = applyRate(taxable, settings.vatRate);
    totalBeforeRounding = taxable + vat;
  } else {
    vat = includedTax(taxable, settings.vatRate);
    totalBeforeRounding = taxable;
  }
  const vatShares = taxable === 0 ? priced.map(() => 0) : allocate(vat, nets.map((n, i) => n + scShares[i]!));

  // 6. Cash rounding.
  const total = roundToIncrement(totalBeforeRounding, settings.rounding.increment, settings.rounding.mode);

  return {
    lines: priced.map((p, i) => ({
      id: p.line.id,
      gross: p.gross,
      itemDiscount: p.itemDiscount,
      billDiscount: billShares[i]!,
      net: nets[i]!,
      serviceCharge: scShares[i]!,
      vat: vatShares[i]!,
    })),
    subtotal: priced.reduce((a, p) => a + p.gross, 0),
    itemDiscounts: priced.reduce((a, p) => a + p.itemDiscount, 0),
    billDiscount,
    discountedSubtotal,
    serviceCharge,
    vat,
    netOfVat: settings.priceMode === "VAT_EXCLUDED" ? taxable : taxable - vat,
    totalBeforeRounding,
    roundingAdjustment: total - totalBeforeRounding,
    total,
  };
}

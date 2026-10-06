# Order totals rules

Status: **Draft — needs review by a Thai accountant** (Master Plan, Phase 0).
Implemented in [`packages/pricing`](../packages/pricing). Every rule below has golden fixtures in
[`packages/pricing/fixtures`](../packages/pricing/fixtures). The Dart port in the POS app must pass the same fixtures.

## Money

- All amounts are whole **satang** (1 THB = 100 satang). Fractions only appear inside a calculation step and are rounded at the step that creates them.
- Unless a rule says otherwise, rounding is **half-up** to 1 satang.
- Rates are in basis points: 7% VAT = `700`, 10% service charge = `1000`.

## Calculation order

1. **Line gross** = (unit price + modifier prices) × quantity. Voided lines are skipped.
2. **Item discount**: a percentage of line gross (rounded), or a fixed amount. It can never exceed line gross.
3. **Bill discount**: a percentage or fixed amount of the sum of line nets after item discounts, and can never exceed it. It is **allocated to lines** in proportion to their net amounts (largest-remainder method), so split bills and item reports add up exactly.
4. **Service charge** = rate × (discounted net of lines that are not exempt). It applies only to order types listed in settings (default: dine-in). Discounts reduce the service charge base.
5. **VAT**:
   - **Prices exclude VAT (VAT added):** VAT = 7% × (discounted subtotal + service charge). Total = base + VAT.
   - **Prices include VAT:** total = discounted subtotal + service charge. VAT = total × 7/107. Net of VAT = total − VAT.
   - Service charge is **subject to VAT** in both modes.
6. **Cash rounding**: the total is rounded to the configured increment (1, 25 or 100 satang), up, down or to the nearest (half-up). The difference is shown as a separate "rounding" line. **VAT is calculated before rounding** and is not changed by it.

## Splitting

- **Evenly into n parts:** the rounded total is divided in units of the rounding increment. Any leftover units go one each to the first parts. Every part is a multiple of the increment, and the parts always sum to the total.
- **By item:** service charge and VAT are allocated to lines (largest remainder). Each group's unrounded amount is the sum of its lines. When two remainders tie, the earlier line or group gets the extra satang. The rounded total is then allocated across groups in rounding-increment units, in proportion to the unrounded amounts. Groups always sum to the bill total.

## Questions for the accountant

1. Should the cash rounding adjustment reduce or increase the VAT base? (The current rule says no: VAT is calculated before rounding.)
2. In VAT-included mode, is "service charge = rate × VAT-inclusive subtotal" acceptable, or must it be calculated on the price excluding VAT?
3. For split-by-item with separate short-form tax invoices, is allocating VAT by largest remainder acceptable, or must each invoice calculate VAT on its own lines?
4. Is a 100% discount (zero total) acceptable on a tax invoice, or should it be issued as a non-tax document?

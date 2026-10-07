import 'money.dart';

enum OrderType {
  dineIn('DINE_IN'),
  takeaway('TAKEAWAY'),
  delivery('DELIVERY');

  const OrderType(this.code);
  final String code;
  static OrderType parse(String code) => values.firstWhere((v) => v.code == code);
}

enum PriceMode {
  vatIncluded('VAT_INCLUDED'),
  vatExcluded('VAT_EXCLUDED');

  const PriceMode(this.code);
  final String code;
  static PriceMode parse(String code) => values.firstWhere((v) => v.code == code);
}

enum RoundingMode {
  nearest('NEAREST'),
  down('DOWN'),
  up('UP');

  const RoundingMode(this.code);
  final String code;
  static RoundingMode parse(String code) => values.firstWhere((v) => v.code == code);
}

class Rounding {
  const Rounding({required this.increment, required this.mode});

  /// 1, 25 or 100 satang.
  final int increment;
  final RoundingMode mode;
}

class PricingSettings {
  const PricingSettings({
    required this.priceMode,
    required this.vatRate,
    required this.serviceChargeRate,
    required this.serviceChargeOrderTypes,
    required this.rounding,
  });

  final PriceMode priceMode;
  final int vatRate;
  final int serviceChargeRate;

  /// Order types that pay service charge.
  final Set<OrderType> serviceChargeOrderTypes;
  final Rounding rounding;
}

const defaultSettings = PricingSettings(
  priceMode: PriceMode.vatExcluded,
  vatRate: 700,
  serviceChargeRate: 1000,
  serviceChargeOrderTypes: {OrderType.dineIn},
  rounding: Rounding(increment: 1, mode: RoundingMode.nearest),
);

sealed class Discount {
  const Discount();
}

class PercentDiscount extends Discount {
  const PercentDiscount(this.rate);

  /// Basis points: 1000 = 10%.
  final int rate;
}

class AmountDiscount extends Discount {
  const AmountDiscount(this.amount);

  /// Satang.
  final int amount;
}

class LineInput {
  const LineInput({
    required this.id,
    required this.unitPrice,
    required this.quantity,
    this.modifierPrices = const [],
    this.discount,
    this.serviceChargeExempt = false,
    this.voided = false,
  });

  final String id;
  final int unitPrice;
  final List<int> modifierPrices;
  final int quantity;
  final Discount? discount;
  final bool serviceChargeExempt;
  final bool voided;
}

class OrderInput {
  const OrderInput({required this.orderType, required this.lines, this.billDiscount});

  final OrderType orderType;
  final List<LineInput> lines;
  final Discount? billDiscount;
}

class LineTotals {
  const LineTotals({
    required this.id,
    required this.gross,
    required this.itemDiscount,
    required this.billDiscount,
    required this.net,
    required this.serviceCharge,
    required this.vat,
  });

  final String id;
  final int gross;
  final int itemDiscount;
  final int billDiscount;

  /// gross − item discount − bill discount share.
  final int net;
  final int serviceCharge;
  final int vat;
}

class OrderTotals {
  const OrderTotals({
    required this.lines,
    required this.subtotal,
    required this.itemDiscounts,
    required this.billDiscount,
    required this.discountedSubtotal,
    required this.serviceCharge,
    required this.vat,
    required this.netOfVat,
    required this.totalBeforeRounding,
    required this.roundingAdjustment,
    required this.total,
  });

  final List<LineTotals> lines;

  /// Sum of line gross amounts (before any discount).
  final int subtotal;
  final int itemDiscounts;
  final int billDiscount;

  /// subtotal − item discounts − bill discount.
  final int discountedSubtotal;
  final int serviceCharge;
  final int vat;

  /// Amount excluding VAT.
  final int netOfVat;
  final int totalBeforeRounding;

  /// Rounded total − total before rounding. Can be negative.
  final int roundingAdjustment;

  /// Amount payable.
  final int total;
}

int _discountAmount(int base, Discount? discount, String label) {
  switch (discount) {
    case null:
      return 0;
    case PercentDiscount(:final rate):
      assertBasisPoints(rate, '$label rate');
      return applyRate(base, rate);
    case AmountDiscount(:final amount):
      assertSatang(amount, '$label amount');
      return amount < base ? amount : base;
  }
}

int roundToIncrement(int amount, int increment, RoundingMode mode) {
  final units = amount ~/ increment;
  final rest = amount - units * increment;
  if (rest == 0) return amount;
  return switch (mode) {
    RoundingMode.down => units * increment,
    RoundingMode.up => (units + 1) * increment,
    RoundingMode.nearest => (rest * 2 >= increment ? units + 1 : units) * increment,
  };
}

void _validateSettings(PricingSettings settings) {
  assertBasisPoints(settings.vatRate, 'vatRate');
  assertBasisPoints(settings.serviceChargeRate, 'serviceChargeRate');
  if (![1, 25, 100].contains(settings.rounding.increment)) {
    throw RangeError('unsupported rounding increment ${settings.rounding.increment}');
  }
}

OrderTotals calculateTotals(OrderInput order, [PricingSettings settings = defaultSettings]) {
  _validateSettings(settings);
  final ids = <String>{};
  final active = <LineInput>[];
  for (final line in order.lines) {
    if (!ids.add(line.id)) throw RangeError('duplicate line id ${line.id}');
    if (!line.voided) active.add(line);
  }

  // 1–2. Line gross and item discounts.
  final gross = <int>[];
  final itemDiscounts = <int>[];
  final afterItem = <int>[];
  for (final line in active) {
    assertSatang(line.unitPrice, 'line ${line.id} unitPrice');
    if (line.quantity <= 0) {
      throw RangeError('line ${line.id} quantity must be a positive integer, got ${line.quantity}');
    }
    for (final p in line.modifierPrices) {
      assertSatang(p, 'line ${line.id} modifier price');
    }
    final each = line.unitPrice + line.modifierPrices.fold<int>(0, (a, b) => a + b);
    final g = each * line.quantity;
    assertSatang(g, 'line ${line.id} gross');
    final d = _discountAmount(g, line.discount, 'line ${line.id} discount');
    gross.add(g);
    itemDiscounts.add(d);
    afterItem.add(g - d);
  }

  // 3. Bill discount, allocated to lines.
  final afterItems = afterItem.fold<int>(0, (a, b) => a + b);
  final billDiscount = _discountAmount(afterItems, order.billDiscount, 'bill discount');
  final billShares = allocate(billDiscount, afterItem);
  final nets = [for (var i = 0; i < active.length; i++) afterItem[i] - billShares[i]];
  final discountedSubtotal = afterItems - billDiscount;

  // 4. Service charge on non-exempt lines, for eligible order types.
  final chargesService = settings.serviceChargeOrderTypes.contains(order.orderType);
  final scWeights = [
    for (var i = 0; i < active.length; i++) chargesService && !active[i].serviceChargeExempt ? nets[i] : 0,
  ];
  final scBase = scWeights.fold<int>(0, (a, b) => a + b);
  final serviceCharge = applyRate(scBase, settings.serviceChargeRate);
  final scShares = scBase == 0 ? List<int>.filled(active.length, 0) : allocate(serviceCharge, scWeights);

  // 5. VAT.
  final taxable = discountedSubtotal + serviceCharge;
  final int vat;
  final int totalBeforeRounding;
  if (settings.priceMode == PriceMode.vatExcluded) {
    vat = applyRate(taxable, settings.vatRate);
    totalBeforeRounding = taxable + vat;
  } else {
    vat = includedTax(taxable, settings.vatRate);
    totalBeforeRounding = taxable;
  }
  final vatShares = taxable == 0
      ? List<int>.filled(active.length, 0)
      : allocate(vat, [for (var i = 0; i < active.length; i++) nets[i] + scShares[i]]);

  // 6. Cash rounding.
  final total = roundToIncrement(totalBeforeRounding, settings.rounding.increment, settings.rounding.mode);

  return OrderTotals(
    lines: [
      for (var i = 0; i < active.length; i++)
        LineTotals(
          id: active[i].id,
          gross: gross[i],
          itemDiscount: itemDiscounts[i],
          billDiscount: billShares[i],
          net: nets[i],
          serviceCharge: scShares[i],
          vat: vatShares[i],
        ),
    ],
    subtotal: gross.fold<int>(0, (a, b) => a + b),
    itemDiscounts: itemDiscounts.fold<int>(0, (a, b) => a + b),
    billDiscount: billDiscount,
    discountedSubtotal: discountedSubtotal,
    serviceCharge: serviceCharge,
    vat: vat,
    netOfVat: settings.priceMode == PriceMode.vatExcluded ? taxable : taxable - vat,
    totalBeforeRounding: totalBeforeRounding,
    roundingAdjustment: total - totalBeforeRounding,
    total: total,
  );
}

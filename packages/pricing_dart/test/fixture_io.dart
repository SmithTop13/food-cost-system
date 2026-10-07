import 'dart:convert';
import 'dart:io';

import 'package:fcs_pricing/fcs_pricing.dart';

/// Shared fixtures live in the TypeScript package; both engines must pass them.
Map<String, dynamic> readFixtures(String name) =>
    jsonDecode(File('../pricing/fixtures/$name').readAsStringSync()) as Map<String, dynamic>;

PricingSettings parseSettings(Map<String, dynamic> json) {
  final rounding = json['rounding'] as Map<String, dynamic>;
  return PricingSettings(
    priceMode: PriceMode.parse(json['priceMode'] as String),
    vatRate: json['vatRate'] as int,
    serviceChargeRate: json['serviceChargeRate'] as int,
    serviceChargeOrderTypes: {
      for (final t in json['serviceChargeOrderTypes'] as List<dynamic>) OrderType.parse(t as String)
    },
    rounding: Rounding(increment: rounding['increment'] as int, mode: RoundingMode.parse(rounding['mode'] as String)),
  );
}

Discount? parseDiscount(Object? json) {
  if (json == null) return null;
  final d = json as Map<String, dynamic>;
  return switch (d['kind']) {
    'PERCENT' => PercentDiscount(d['rate'] as int),
    'AMOUNT' => AmountDiscount(d['amount'] as int),
    final kind => throw FormatException('unknown discount kind $kind'),
  };
}

OrderInput parseOrder(Map<String, dynamic> json) => OrderInput(
      orderType: OrderType.parse(json['orderType'] as String),
      billDiscount: parseDiscount(json['billDiscount']),
      lines: [
        for (final l in (json['lines'] as List<dynamic>).cast<Map<String, dynamic>>())
          LineInput(
            id: l['id'] as String,
            unitPrice: l['unitPrice'] as int,
            quantity: l['quantity'] as int,
            modifierPrices: ((l['modifierPrices'] as List<dynamic>?) ?? const []).cast<int>(),
            discount: parseDiscount(l['discount']),
            serviceChargeExempt: (l['serviceChargeExempt'] as bool?) ?? false,
            voided: (l['voided'] as bool?) ?? false,
          ),
      ],
    );

Map<String, Object> lineToJson(LineTotals l) => {
      'id': l.id,
      'gross': l.gross,
      'itemDiscount': l.itemDiscount,
      'billDiscount': l.billDiscount,
      'net': l.net,
      'serviceCharge': l.serviceCharge,
      'vat': l.vat,
    };

/// Same field names as the TypeScript OrderTotals, for comparison with the fixtures.
Map<String, Object> totalsToJson(OrderTotals t) => {
      'lines': t.lines.map(lineToJson).toList(),
      'subtotal': t.subtotal,
      'itemDiscounts': t.itemDiscounts,
      'billDiscount': t.billDiscount,
      'discountedSubtotal': t.discountedSubtotal,
      'serviceCharge': t.serviceCharge,
      'vat': t.vat,
      'netOfVat': t.netOfVat,
      'totalBeforeRounding': t.totalBeforeRounding,
      'roundingAdjustment': t.roundingAdjustment,
      'total': t.total,
    };

Map<String, Object> groupToJson(SplitGroup g) => {
      'lineIds': g.lineIds,
      'net': g.net,
      'serviceCharge': g.serviceCharge,
      'vat': g.vat,
      'total': g.total,
    };

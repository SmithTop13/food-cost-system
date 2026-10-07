import 'money.dart';
import 'totals.dart';

/// Split an amount into [parts] payments, each a multiple of [increment], summing exactly to [total].
List<int> splitEvenly(int total, int parts, [int increment = 1]) {
  if (parts < 1) throw RangeError('parts must be a positive integer, got $parts');
  if (total % increment != 0) throw RangeError('total $total is not a multiple of increment $increment');
  final units = total ~/ increment;
  final base = units ~/ parts;
  final extra = units - base * parts;
  return [for (var i = 0; i < parts; i++) (base + (i < extra ? 1 : 0)) * increment];
}

class SplitGroup {
  const SplitGroup({
    required this.lineIds,
    required this.net,
    required this.serviceCharge,
    required this.vat,
    required this.total,
  });

  final List<String> lineIds;
  final int net;
  final int serviceCharge;
  final int vat;

  /// Amount payable for this group. Groups sum exactly to the bill total.
  final int total;
}

/// Split a calculated bill by item. Every non-voided line must appear in exactly one group.
List<SplitGroup> splitByItems(OrderTotals totals, List<List<String>> groups, PriceMode priceMode, Rounding rounding) {
  final byId = {for (final l in totals.lines) l.id: l};
  final seen = <String>{};
  for (final group in groups) {
    if (group.isEmpty) throw RangeError('split groups must not be empty');
    for (final id in group) {
      if (!byId.containsKey(id)) throw RangeError('unknown or voided line $id');
      if (!seen.add(id)) throw RangeError('line $id is in more than one group');
    }
  }
  if (seen.length != byId.length) {
    final missing = byId.keys.where((id) => !seen.contains(id)).join(', ');
    throw RangeError('lines not assigned to a group: $missing');
  }

  final partial = [
    for (final group in groups)
      () {
        final lines = group.map((id) => byId[id]!).toList();
        final net = lines.fold<int>(0, (a, l) => a + l.net);
        final sc = lines.fold<int>(0, (a, l) => a + l.serviceCharge);
        final vat = lines.fold<int>(0, (a, l) => a + l.vat);
        final unrounded = priceMode == PriceMode.vatExcluded ? net + sc + vat : net + sc;
        return (lineIds: [...group], net: net, sc: sc, vat: vat, unrounded: unrounded);
      }(),
  ];

  final increment = rounding.increment;
  final units = allocate(totals.total ~/ increment, [for (final g in partial) g.unrounded]);
  return [
    for (var i = 0; i < partial.length; i++)
      SplitGroup(
        lineIds: partial[i].lineIds,
        net: partial[i].net,
        serviceCharge: partial[i].sc,
        vat: partial[i].vat,
        total: units[i] * increment,
      ),
  ];
}

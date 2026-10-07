import 'package:fcs_pricing/fcs_pricing.dart';
import 'package:test/test.dart';

import 'fixture_io.dart';

/// 300 random orders with the TypeScript engine's results (packages/pricing/fixtures/random.json).
/// Every number must match exactly: the POS and the cloud must never disagree on a bill.
void main() {
  final cases = (readFixtures('random.json')['cases'] as List<dynamic>).cast<Map<String, dynamic>>();

  test('has the generated cases', () => expect(cases, hasLength(300)));

  for (final c in cases) {
    test('seed ${c['seed']}', () {
      final settings = parseSettings(c['settings'] as Map<String, dynamic>);
      final totals = calculateTotals(parseOrder(c['order'] as Map<String, dynamic>), settings);
      expect(totalsToJson(totals), c['expected']);

      final even = c['splitEvenly'] as Map<String, dynamic>;
      expect(splitEvenly(totals.total, even['parts'] as int, settings.rounding.increment), even['expected']);

      final byItems = c['splitByItems'] as Map<String, dynamic>;
      final groups = [for (final g in byItems['groups'] as List<dynamic>) (g as List<dynamic>).cast<String>()];
      expect(splitByItems(totals, groups, settings.priceMode, settings.rounding).map(groupToJson).toList(),
          byItems['expected']);
    });
  }
}

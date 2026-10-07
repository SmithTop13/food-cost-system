import 'package:fcs_pricing/fcs_pricing.dart';
import 'package:test/test.dart';

import 'fixture_io.dart';

/// The hand-worked golden fixtures (packages/pricing/fixtures/totals.json).
void main() {
  final file = readFixtures('totals.json');
  final defaults = file['defaults'] as Map<String, dynamic>;

  for (final c in (file['cases'] as List<dynamic>).cast<Map<String, dynamic>>()) {
    group(c['name'] as String, () {
      final settings = parseSettings({...defaults, ...?(c['settings'] as Map<String, dynamic>?)});
      final totals = calculateTotals(parseOrder(c['order'] as Map<String, dynamic>), settings);
      final actual = totalsToJson(totals);

      test('matches expected totals', () {
        final expected = Map<String, dynamic>.of(c['expected'] as Map<String, dynamic>);
        final expectedLines = expected.remove('lines') as List<dynamic>?;
        for (final MapEntry(:key, :value) in expected.entries) {
          expect(actual[key], value, reason: key);
        }
        for (final line in (expectedLines ?? const []).cast<Map<String, dynamic>>()) {
          final got = (actual['lines'] as List<Map<String, Object>>).firstWhere((l) => l['id'] == line['id']);
          for (final MapEntry(:key, :value) in line.entries) {
            expect(got[key], value, reason: 'line ${line['id']} $key');
          }
        }
      });

      if (c['splitEvenly'] case final Map<String, dynamic> split) {
        test('splits evenly into ${split['parts']}', () {
          expect(splitEvenly(totals.total, split['parts'] as int, settings.rounding.increment), split['expected']);
        });
      }

      if (c['splitByItems'] case final Map<String, dynamic> split) {
        test('splits by items', () {
          final groups = [for (final g in split['groups'] as List<dynamic>) (g as List<dynamic>).cast<String>()];
          final result = splitByItems(totals, groups, settings.priceMode, settings.rounding);
          expect(result.map(groupToJson).toList(), split['expected']);
        });
      }
    });
  }
}

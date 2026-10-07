import 'package:fcs_pricing/fcs_pricing.dart';
import 'package:test/test.dart';

void main() {
  const takeaway = OrderType.takeaway;

  test('rejects negative prices, bad quantities, duplicate lines and >100% discounts', () {
    expect(
        () => calculateTotals(
            const OrderInput(orderType: takeaway, lines: [LineInput(id: 'a', unitPrice: -1, quantity: 1)])),
        throwsRangeError);
    expect(
        () => calculateTotals(
            const OrderInput(orderType: takeaway, lines: [LineInput(id: 'a', unitPrice: 100, quantity: 0)])),
        throwsRangeError);
    expect(
        () => calculateTotals(const OrderInput(orderType: takeaway, lines: [
              LineInput(id: 'a', unitPrice: 100, quantity: 1),
              LineInput(id: 'a', unitPrice: 100, quantity: 1),
            ])),
        throwsA(isA<RangeError>().having((e) => e.message, 'message', contains('duplicate'))));
    expect(
        () => calculateTotals(const OrderInput(
            orderType: takeaway,
            lines: [LineInput(id: 'a', unitPrice: 100, quantity: 1, discount: PercentDiscount(12000))])),
        throwsRangeError);
  });

  test('allocate stays exact beyond 64-bit intermediate products', () {
    expect(allocate(9000000000000, [3000000000, 6000000000]), [3000000000000, 6000000000000]);
    expect(allocate(10, [1, 1, 1]), [4, 3, 3]);
    expect(allocate(5, [0, 0]), [3, 2]);
  });

  test('rejects incomplete or overlapping split groups', () {
    final t = calculateTotals(const OrderInput(orderType: takeaway, lines: [
      LineInput(id: 'a', unitPrice: 100, quantity: 1),
      LineInput(id: 'b', unitPrice: 100, quantity: 1),
    ]));
    const r = Rounding(increment: 1, mode: RoundingMode.nearest);
    expect(
        () => splitByItems(
            t,
            [
              ['a']
            ],
            PriceMode.vatExcluded,
            r),
        throwsRangeError);
    expect(
        () => splitByItems(
            t,
            [
              ['a', 'b'],
              ['b']
            ],
            PriceMode.vatExcluded,
            r),
        throwsRangeError);
  });
}

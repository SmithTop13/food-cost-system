import 'package:fcs_pos/src/models.dart';
import 'package:fcs_pos/src/order.dart';
import 'package:fcs_pricing/fcs_pricing.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

void main() {
  final menu = BranchMenu.fromJson(sampleMenuJson());
  MenuItem item(String id) => menu.items.firstWhere((i) => i.id == id);
  final spice = menu.modifierGroups['spice']!;
  final extras = menu.modifierGroups['extras']!;
  ({ModifierGroup group, ModifierOption option}) opt(ModifierGroup g, String id) =>
      (group: g, option: g.options.firstWhere((o) => o.id == id));

  OrderDraft newDraft() {
    var n = 0;
    return OrderDraft(newId: () => 'id${++n}');
  }

  test('parses the branch menu, pricing and sold-out flags', () {
    expect(menu.branchName, 'บ้านกะเพรา อารีย์');
    expect(menu.pricing.serviceChargeRate, 1000);
    expect(menu.pricing.rounding.increment, 25);
    expect(item('padseeew').available, isFalse);
    expect(menu.groupsFor(item('kaphrao')).map((g) => g.id), ['spice', 'extras']);
    expect(menu.itemsIn('cat-drinks').map((i) => i.id), ['thaitea', 'water']);
  });

  test('the same dish with the same choices raises the quantity; different choices make a new line', () {
    final d = newDraft()
      ..add(item('kaphrao'), [opt(spice, 'hot'), opt(extras, 'egg')])
      ..add(item('kaphrao'), [opt(spice, 'hot'), opt(extras, 'egg')])
      ..add(item('kaphrao'), [opt(spice, 'mild')])
      ..add(item('thaitea'))
      ..add(item('thaitea'));
    expect(d.lines.map((l) => (l.item.id, l.quantity)), [('kaphrao', 2), ('kaphrao', 1), ('thaitea', 2)]);
    expect(d.itemCount, 5);
  });

  test('a line with a note is never merged', () {
    final d = newDraft()..add(item('thaitea'));
    d.setNote(d.lines.first, 'less sweet');
    d.add(item('thaitea'));
    expect(d.lines, hasLength(2));
  });

  test('decrementing to zero removes the line', () {
    final d = newDraft()..add(item('water'));
    d.decrement(d.lines.first);
    expect(d.isEmpty, isTrue);
  });

  test('totals come from the shared engine, with modifiers, service charge and exemptions', () {
    final d = newDraft()
      ..add(item('kaphrao'), [opt(spice, 'hot'), opt(extras, 'egg')]) // 70.00
      ..add(item('water')); // 15.00, no service charge
    final t = d.totals(menu.pricing);
    // Service charge 10% of 70.00 = 7.00. VAT 7% of 92.00 = 6.44. 98.44 → nearest 0.25 = 98.50.
    expect([t.subtotal, t.serviceCharge, t.vat, t.totalBeforeRounding, t.total], [8500, 700, 644, 9844, 9850]);
    expect(
      t.total,
      calculateTotals(
        const OrderInput(
          orderType: OrderType.dineIn,
          lines: [
            LineInput(id: 'a', unitPrice: 6000, modifierPrices: [0, 1000], quantity: 1),
            LineInput(id: 'b', unitPrice: 1500, quantity: 1, serviceChargeExempt: true),
          ],
        ),
        menu.pricing,
      ).total,
    );
    d.setOrderType(OrderType.takeaway);
    expect(d.totals(menu.pricing).serviceCharge, 0);
  });

  test('modifier limits', () {
    expect(selectionProblem(spice, 0), 'min');
    expect(selectionProblem(spice, 1), isNull);
    expect(selectionProblem(extras, 0), isNull);
    expect(selectionProblem(extras, 3), 'max');
  });

  test('sending makes ORDER_OPENED, ITEM_ADDED per line with a snapshot, then ITEMS_FIRED', () {
    final d = newDraft()
      ..setTable(' 12 ')
      ..add(item('kaphrao'), [opt(spice, 'hot'), opt(extras, 'egg')])
      ..add(item('thaitea'));
    d.setNote(d.lines.last, 'less ice');
    final events = d.toEvents(deviceId: 'device-1', staffId: 'staff-nok', createdAt: 1790000000000);
    expect(events.map((e) => e['type']), ['ORDER_OPENED', 'ITEM_ADDED', 'ITEM_ADDED', 'ITEMS_FIRED']);
    expect(events.map((e) => e['id']).toSet(), hasLength(4)); // unique event ids
    final orderId = (events[0]['payload'] as Map)['orderId'];
    expect(events[0]['payload'], {'orderId': orderId, 'orderType': 'DINE_IN', 'tableId': '12'});
    expect(events[1]['payload'], {
      'orderId': orderId,
      'lineId': d.lines[0].lineId,
      'menuItemId': 'kaphrao',
      'unitPrice': 6000,
      'quantity': 1,
      'modifierPrices': [0, 1000],
      'nameTh': 'ผัดกะเพราหมูสับ',
      'modifiers': [
        {'groupId': 'spice', 'optionId': 'hot', 'nameTh': 'เผ็ดมาก', 'price': 0},
        {'groupId': 'extras', 'optionId': 'egg', 'nameTh': 'ไข่ดาว', 'price': 1000},
      ],
    });
    expect((events[2]['payload'] as Map)['note'], 'less ice');
    expect(events[3]['payload'], {
      'orderId': orderId,
      'lineIds': [d.lines[0].lineId, d.lines[1].lineId],
    });
    expect(events.every((e) => e['deviceId'] == 'device-1' && e['staffId'] == 'staff-nok'), isTrue);
  });
}

import 'package:fcs_pricing/fcs_pricing.dart';
import 'package:flutter/foundation.dart';

import 'models.dart';

/// Checks a set of chosen options against a group's limits. Returns null when valid.
String? selectionProblem(ModifierGroup group, int chosen) {
  if (chosen < group.minChoices) return 'min';
  if (chosen > group.maxChoices) return 'max';
  return null;
}

class DraftLine {
  DraftLine({required this.lineId, required this.item, required this.options, this.quantity = 1, this.note});

  final String lineId;
  final MenuItem item;

  /// Chosen modifier options with the group each came from, in menu order.
  final List<({ModifierGroup group, ModifierOption option})> options;
  int quantity;
  String? note;

  List<int> get modifierPrices => [for (final o in options) o.option.price];

  bool sameChoiceAs(MenuItem other, List<ModifierOption> otherOptions) =>
      item.id == other.id &&
      (note == null || note!.isEmpty) &&
      listEquals([for (final o in options) o.option.id], [for (final o in otherOptions) o.id]);
}

/// The order being entered on this device, before it is sent.
class OrderDraft extends ChangeNotifier {
  OrderDraft({required this.newId});

  final String Function() newId;
  OrderType orderType = OrderType.dineIn;
  String table = '';
  final List<DraftLine> lines = [];

  bool get isEmpty => lines.isEmpty;
  int get itemCount => lines.fold(0, (n, l) => n + l.quantity);

  void setOrderType(OrderType type) {
    orderType = type;
    notifyListeners();
  }

  void setTable(String value) {
    table = value;
    notifyListeners();
  }

  /// Adds one of [item]. Tapping the same dish with the same choices again raises its quantity
  /// instead of adding a new line: faster to enter and easier for the kitchen to read.
  void add(MenuItem item, [List<({ModifierGroup group, ModifierOption option})> options = const []]) {
    final existing = lines.where((l) => l.sameChoiceAs(item, [for (final o in options) o.option])).firstOrNull;
    if (existing != null) {
      existing.quantity++;
    } else {
      lines.add(DraftLine(lineId: newId(), item: item, options: options));
    }
    notifyListeners();
  }

  void increment(DraftLine line) {
    line.quantity++;
    notifyListeners();
  }

  void decrement(DraftLine line) {
    if (line.quantity > 1) {
      line.quantity--;
    } else {
      lines.remove(line);
    }
    notifyListeners();
  }

  void setNote(DraftLine line, String note) {
    line.note = note.trim().isEmpty ? null : note.trim();
    notifyListeners();
  }

  void clear() {
    lines.clear();
    table = '';
    notifyListeners();
  }

  OrderTotals totals(PricingSettings settings) => calculateTotals(
    OrderInput(
      orderType: orderType,
      lines: [
        for (final l in lines)
          LineInput(
            id: l.lineId,
            unitPrice: l.item.price,
            modifierPrices: l.modifierPrices,
            quantity: l.quantity,
            serviceChargeExempt: l.item.serviceChargeExempt,
          ),
      ],
    ),
    settings,
  );

  /// The sync events for sending this order to the kitchen: open the order, add every line
  /// (with a snapshot of names and prices as sold), then fire them all.
  List<Map<String, dynamic>> toEvents({required String deviceId, required String staffId, required int createdAt}) {
    final orderId = newId();
    Map<String, dynamic> event(String type, Map<String, dynamic> payload) => {
      'id': newId(),
      'deviceId': deviceId,
      'staffId': staffId,
      'createdAt': createdAt,
      'type': type,
      'payload': payload,
    };
    return [
      event('ORDER_OPENED', {'orderId': orderId, 'orderType': orderType.code, if (table.trim().isNotEmpty) 'tableId': table.trim()}),
      for (final l in lines)
        event('ITEM_ADDED', {
          'orderId': orderId,
          'lineId': l.lineId,
          'menuItemId': l.item.id,
          'unitPrice': l.item.price,
          'quantity': l.quantity,
          'modifierPrices': l.modifierPrices,
          if (l.note != null) 'note': l.note,
          // Snapshot as sold: menu edits later must not change past orders.
          'nameTh': l.item.nameTh,
          'modifiers': [
            for (final o in l.options) {'groupId': o.group.id, 'optionId': o.option.id, 'nameTh': o.option.nameTh, 'price': o.option.price},
          ],
        }),
      event('ITEMS_FIRED', {
        'orderId': orderId,
        'lineIds': [for (final l in lines) l.lineId],
      }),
    ];
  }
}

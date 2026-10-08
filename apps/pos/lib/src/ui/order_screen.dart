import 'package:fcs_pricing/fcs_pricing.dart';
import 'package:flutter/material.dart';

import '../app_controller.dart';
import '../i18n.dart';
import '../models.dart';
import '../order.dart';
import 'app.dart';
import 'modifier_sheet.dart';

/// Order entry. Tablet: menu on the left, the order on the right. Phone: the order opens from
/// a bar at the bottom.
class OrderScreen extends StatefulWidget {
  const OrderScreen({super.key, required this.controller});

  final AppController controller;

  @override
  State<OrderScreen> createState() => _OrderScreenState();
}

class _OrderScreenState extends State<OrderScreen> {
  String? _categoryId; // null = all

  AppController get c => widget.controller;

  Future<void> _tapItem(MenuItem item) async {
    final menu = c.menu!;
    final groups = menu.groupsFor(item);
    if (groups.isEmpty) {
      c.draft.add(item); // one tap for dishes without choices
      return;
    }
    final options = await showModifierSheet(context, controller: c, item: item, groups: groups);
    if (options != null) c.draft.add(item, options);
  }

  Future<void> _send() async {
    final messenger = ScaffoldMessenger.of(context);
    await c.sendOrder();
    messenger.showSnackBar(SnackBar(content: Text(c.t['sent']), duration: const Duration(seconds: 2)));
  }

  @override
  Widget build(BuildContext context) {
    final t = c.t;
    final menu = c.menu;
    return Scaffold(
      appBar: AppBar(
        title: Text('${menu?.branchName ?? ''} · ${c.staff?.name ?? ''}'),
        actions: [
          if (c.offline)
            Padding(
              padding: const EdgeInsets.all(8),
              child: Icon(Icons.cloud_off, semanticLabel: t['offline']),
            ),
          if (c.pendingEvents > 0)
            Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Text('${c.pendingEvents} ${t['waitingToSync']}', key: const Key('pending')),
              ),
            ),
          LangButton(controller: c),
          TextButton(key: const Key('sign-out'), onPressed: c.signOut, child: Text(t['signOut'])),
        ],
      ),
      body: menu == null
          ? const Center(child: CircularProgressIndicator())
          : LayoutBuilder(
              builder: (context, box) {
                final wide = box.maxWidth >= 760;
                final menuPane = _MenuPane(
                  controller: c,
                  menu: menu,
                  categoryId: _categoryId,
                  onCategory: (id) => setState(() => _categoryId = id),
                  onItem: _tapItem,
                );
                if (wide) {
                  return Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(child: menuPane),
                      const VerticalDivider(width: 1),
                      SizedBox(
                        width: 380,
                        child: OrderPanel(controller: c, onSend: _send),
                      ),
                    ],
                  );
                }
                return Column(
                  children: [
                    Expanded(child: menuPane),
                    _OrderBar(controller: c, onSend: _send),
                  ],
                );
              },
            ),
    );
  }
}

class _MenuPane extends StatelessWidget {
  const _MenuPane({required this.controller, required this.menu, required this.categoryId, required this.onCategory, required this.onItem});

  final AppController controller;
  final BranchMenu menu;
  final String? categoryId;
  final ValueChanged<String?> onCategory;
  final ValueChanged<MenuItem> onItem;

  @override
  Widget build(BuildContext context) {
    final lang = controller.lang;
    final items = menu.itemsIn(categoryId);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          height: 60,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            children: [
              _chip(context, controller.t['all'], categoryId == null, () => onCategory(null), const Key('cat-all')),
              for (final cat in menu.categories)
                _chip(context, cat.name(lang), categoryId == cat.id, () => onCategory(cat.id), Key('cat-${cat.id}')),
            ],
          ),
        ),
        Expanded(
          child: GridView.builder(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
              maxCrossAxisExtent: 190,
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 1.15,
            ),
            itemCount: items.length,
            itemBuilder: (context, i) => _ItemCard(item: items[i], lang: lang, soldOut: controller.t['soldOut'], onTap: onItem),
          ),
        ),
      ],
    );
  }

  Widget _chip(BuildContext context, String label, bool selected, VoidCallback onTap, Key key) => Padding(
    padding: const EdgeInsets.only(right: 8),
    child: ChoiceChip(key: key, label: Text(label), selected: selected, onSelected: (_) => onTap()),
  );
}

class _ItemCard extends StatelessWidget {
  const _ItemCard({required this.item, required this.lang, required this.soldOut, required this.onTap});

  final MenuItem item;
  final Lang lang;
  final String soldOut;
  final ValueChanged<MenuItem> onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final secondary = lang == Lang.th ? item.nameEn : item.nameTh;
    return Opacity(
      opacity: item.available ? 1 : 0.45,
      child: Card(
        key: Key('item-${item.id}'),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: item.available ? () => onTap(item) : null,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.name(lang), maxLines: 2, overflow: TextOverflow.ellipsis, style: theme.textTheme.titleMedium),
                if (secondary != null && secondary.isNotEmpty)
                  Text(secondary, maxLines: 1, overflow: TextOverflow.ellipsis, style: theme.textTheme.bodySmall),
                const Spacer(),
                Text(
                  item.available ? formatBaht(item.price) : soldOut,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontFeatures: const [FontFeature.tabularFigures()],
                    color: item.available ? theme.colorScheme.primary : theme.colorScheme.error,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Phone layout: a bar with the count and total that opens the order.
class _OrderBar extends StatelessWidget {
  const _OrderBar({required this.controller, required this.onSend});

  final AppController controller;
  final Future<void> Function() onSend;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller.draft,
      builder: (context, _) {
        final total = controller.draft.totals(controller.menu!.pricing).total;
        return SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: FilledButton(
              key: const Key('view-order'),
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
              onPressed: () => showModalBottomSheet<void>(
                context: context,
                isScrollControlled: true,
                builder: (_) => FractionallySizedBox(
                  heightFactor: 0.9,
                  child: OrderPanel(
                    controller: controller,
                    onSend: () async {
                      Navigator.of(context).pop();
                      await onSend();
                    },
                  ),
                ),
              ),
              child: Text('${controller.t['viewOrder']} (${controller.draft.itemCount}) · ${formatBaht(total)}'),
            ),
          ),
        );
      },
    );
  }
}

class OrderPanel extends StatelessWidget {
  const OrderPanel({super.key, required this.controller, required this.onSend});

  final AppController controller;
  final Future<void> Function() onSend;

  @override
  Widget build(BuildContext context) {
    final t = controller.t;
    final draft = controller.draft;
    return ListenableBuilder(
      listenable: draft,
      builder: (context, _) {
        final pricing = controller.menu!.pricing;
        final totals = draft.totals(pricing);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
              child: SegmentedButton<OrderType>(
                key: const Key('order-type'),
                segments: [
                  ButtonSegment(value: OrderType.dineIn, label: Text(t['dineIn'])),
                  ButtonSegment(value: OrderType.takeaway, label: Text(t['takeaway'])),
                  ButtonSegment(value: OrderType.delivery, label: Text(t['delivery'])),
                ],
                selected: {draft.orderType},
                showSelectedIcon: false,
                onSelectionChanged: (s) => draft.setOrderType(s.first),
              ),
            ),
            if (draft.orderType == OrderType.dineIn)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                child: _TableField(draft: draft, label: t['table']),
              ),
            const Divider(),
            Expanded(
              child: draft.isEmpty
                  ? Center(child: Text(t['emptyOrder']))
                  : ListView(
                      children: [for (final line in draft.lines) _LineTile(controller: controller, line: line)],
                    ),
            ),
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: _Totals(totals: totals, pricing: pricing, t: t),
            ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: FilledButton(
                key: const Key('send'),
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
                onPressed: draft.isEmpty ? null : onSend,
                child: Text('${t['send']} · ${formatBaht(totals.total)}'),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _TableField extends StatefulWidget {
  const _TableField({required this.draft, required this.label});

  final OrderDraft draft;
  final String label;

  @override
  State<_TableField> createState() => _TableFieldState();
}

class _TableFieldState extends State<_TableField> {
  late final _text = TextEditingController(text: widget.draft.table);

  @override
  void didUpdateWidget(covariant _TableField old) {
    super.didUpdateWidget(old);
    if (widget.draft.table != _text.text) _text.text = widget.draft.table; // cleared after sending
  }

  @override
  Widget build(BuildContext context) => TextField(
    key: const Key('table'),
    controller: _text,
    decoration: InputDecoration(labelText: widget.label, isDense: true, border: const OutlineInputBorder()),
    onChanged: widget.draft.setTable,
  );
}

class _LineTile extends StatelessWidget {
  const _LineTile({required this.controller, required this.line});

  final AppController controller;
  final DraftLine line;

  @override
  Widget build(BuildContext context) {
    final lang = controller.lang;
    final draft = controller.draft;
    final details = [
      for (final o in line.options) o.option.name(lang) + (o.option.price > 0 ? ' +${formatBaht(o.option.price)}' : ''),
      if (line.note != null) '“${line.note}”',
    ];
    final lineTotal = (line.item.price + line.modifierPrices.fold<int>(0, (a, b) => a + b)) * line.quantity;
    return ListTile(
      key: Key('line-${line.lineId}'),
      contentPadding: const EdgeInsets.only(left: 12, right: 4),
      title: Text(line.item.name(lang)),
      subtitle: details.isEmpty ? null : Text(details.join(' · ')),
      onLongPress: () => _editNote(context),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(key: Key('dec-${line.lineId}'), icon: const Icon(Icons.remove_circle_outline), onPressed: () => draft.decrement(line)),
          Text('${line.quantity}', style: Theme.of(context).textTheme.titleMedium),
          IconButton(key: Key('inc-${line.lineId}'), icon: const Icon(Icons.add_circle_outline), onPressed: () => draft.increment(line)),
          SizedBox(
            width: 76,
            child: Text(
              formatBaht(lineTotal),
              textAlign: TextAlign.right,
              style: Theme.of(context).textTheme.titleSmall?.copyWith(fontFeatures: const [FontFeature.tabularFigures()]),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _editNote(BuildContext context) async {
    final t = controller.t;
    final text = TextEditingController(text: line.note ?? '');
    final note = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('${t['note']}: ${line.item.name(controller.lang)}'),
        content: TextField(key: const Key('note-field'), controller: text, autofocus: true, maxLength: 120),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: Text(t['cancel'])),
          FilledButton(key: const Key('note-save'), onPressed: () => Navigator.pop(context, text.text), child: Text(t['add'])),
        ],
      ),
    );
    if (note != null) controller.draft.setNote(line, note);
  }
}

class _Totals extends StatelessWidget {
  const _Totals({required this.totals, required this.pricing, required this.t});

  final OrderTotals totals;
  final PricingSettings pricing;
  final Strings t;

  @override
  Widget build(BuildContext context) {
    final style = Theme.of(context).textTheme.bodyMedium;
    Widget row(String label, int amount, {Key? key, TextStyle? textStyle}) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Expanded(child: Text(label, style: textStyle ?? style)),
          Text(
            formatBaht(amount),
            key: key,
            style: (textStyle ?? style)?.copyWith(fontFeatures: const [FontFeature.tabularFigures()]),
          ),
        ],
      ),
    );
    final included = pricing.priceMode == PriceMode.vatIncluded;
    return Column(
      children: [
        row(t['subtotal'], totals.discountedSubtotal),
        if (totals.serviceCharge > 0) row(t['serviceCharge'], totals.serviceCharge),
        row(included ? '${t['vat']} (${t['vatIncluded']})' : t['vat'], totals.vat),
        if (totals.roundingAdjustment != 0) row(t['rounding'], totals.roundingAdjustment),
        row(t['total'], totals.total, key: const Key('total'), textStyle: Theme.of(context).textTheme.titleLarge),
      ],
    );
  }
}

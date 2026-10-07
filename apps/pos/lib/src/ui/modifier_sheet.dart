import 'package:flutter/material.dart';

import '../app_controller.dart';
import '../i18n.dart';
import '../models.dart';
import '../order.dart';

typedef ChosenOptions = List<({ModifierGroup group, ModifierOption option})>;

/// Pick modifiers for one dish. Returns null if cancelled. "Add" is enabled only when every
/// group's min/max choices are met.
Future<ChosenOptions?> showModifierSheet(
  BuildContext context, {
  required AppController controller,
  required MenuItem item,
  required List<ModifierGroup> groups,
}) => showModalBottomSheet<ChosenOptions>(
  context: context,
  isScrollControlled: true,
  showDragHandle: true,
  builder: (_) => _ModifierSheet(controller: controller, item: item, groups: groups),
);

class _ModifierSheet extends StatefulWidget {
  const _ModifierSheet({required this.controller, required this.item, required this.groups});

  final AppController controller;
  final MenuItem item;
  final List<ModifierGroup> groups;

  @override
  State<_ModifierSheet> createState() => _ModifierSheetState();
}

class _ModifierSheetState extends State<_ModifierSheet> {
  late final Map<String, List<String>> _chosen = {for (final g in widget.groups) g.id: <String>[]};

  bool get _valid => widget.groups.every((g) => selectionProblem(g, _chosen[g.id]!.length) == null);

  void _toggle(ModifierGroup group, ModifierOption option) {
    final picked = _chosen[group.id]!;
    setState(() {
      if (picked.contains(option.id)) {
        picked.remove(option.id);
      } else if (group.maxChoices == 1) {
        picked
          ..clear()
          ..add(option.id); // single choice: tapping another option switches to it
      } else if (picked.length < group.maxChoices) {
        picked.add(option.id);
      }
    });
  }

  ChosenOptions _result() => [
    for (final g in widget.groups)
      for (final o in g.options)
        if (_chosen[g.id]!.contains(o.id)) (group: g, option: o),
  ];

  String _rule(ModifierGroup g, Strings t) {
    if (g.minChoices == g.maxChoices) return '${t['chooseExactly']} ${g.minChoices}';
    if (g.minChoices > 0) return '${t['chooseAtLeast']} ${g.minChoices} · ${t['chooseUpTo']} ${g.maxChoices}';
    return '${t['chooseUpTo']} ${g.maxChoices}';
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.controller.t;
    final lang = widget.controller.lang;
    final extra = _result().fold<int>(0, (a, o) => a + o.option.price);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(widget.item.name(lang), style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 8),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  for (final g in widget.groups) ...[
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Text(g.name(lang), style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(width: 8),
                        Text(g.required ? '${t['required']} · ${_rule(g, t)}' : _rule(g, t), style: Theme.of(context).textTheme.bodySmall),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final o in g.options)
                          FilterChip(
                            key: Key('opt-${o.id}'),
                            label: Text(o.name(lang) + (o.price > 0 ? ' +${formatBaht(o.price)}' : '')),
                            selected: _chosen[g.id]!.contains(o.id),
                            onSelected: (_) => _toggle(g, o),
                          ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 20),
            FilledButton(
              key: const Key('modifier-add'),
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
              onPressed: _valid ? () => Navigator.pop(context, _result()) : null,
              child: Text('${t['add']} · ${formatBaht(widget.item.price + extra)}'),
            ),
          ],
        ),
      ),
    );
  }
}

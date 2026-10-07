import 'package:flutter/material.dart';

import '../app_controller.dart';
import '../models.dart';
import 'app.dart';

/// Shared tablet sign-in: tap your name, then your PIN. One PIN check per sign-in.
class StaffScreen extends StatelessWidget {
  const StaffScreen({super.key, required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    final t = controller.t;
    final staff = controller.roster?.staff ?? const <StaffMember>[];
    return Scaffold(
      appBar: AppBar(
        title: Text(controller.menu?.branchName ?? ''),
        actions: [LangButton(controller: controller)],
      ),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (controller.offline) _OfflineBanner(text: t['offline']),
            Text(t['whoIsWorking'], style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 16),
            if (staff.isEmpty) Text(t['noStaff']),
            Expanded(
              child: GridView.extent(
                maxCrossAxisExtent: 200,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 1.6,
                children: [
                  for (final s in staff)
                    Card(
                      key: Key('staff-${s.id}'),
                      clipBehavior: Clip.antiAlias,
                      child: InkWell(
                        onTap: () => showDialog<void>(
                          context: context,
                          builder: (_) => PinDialog(controller: controller, member: s),
                        ),
                        child: Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(s.name, style: Theme.of(context).textTheme.titleLarge),
                              Text(t['role.${s.role.name}'], style: Theme.of(context).textTheme.bodySmall),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OfflineBanner extends StatelessWidget {
  const _OfflineBanner({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: Material(
      color: Theme.of(context).colorScheme.tertiaryContainer,
      borderRadius: BorderRadius.circular(8),
      child: Padding(padding: const EdgeInsets.all(12), child: Text(text)),
    ),
  );
}

class PinDialog extends StatefulWidget {
  const PinDialog({super.key, required this.controller, required this.member});

  final AppController controller;
  final StaffMember member;

  @override
  State<PinDialog> createState() => _PinDialogState();
}

class _PinDialogState extends State<PinDialog> {
  String _pin = '';
  bool _checking = false;
  bool _wrong = false;

  void _press(String digit) {
    if (_checking || _pin.length >= 6) return;
    setState(() {
      _pin += digit;
      _wrong = false;
    });
  }

  Future<void> _submit() async {
    if (_pin.length < 4 || _checking) return;
    setState(() => _checking = true);
    final ok = await widget.controller.signIn(widget.member, _pin);
    if (!mounted) return;
    if (ok) {
      Navigator.of(context).pop();
    } else {
      setState(() {
        _checking = false;
        _wrong = true;
        _pin = '';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.controller.t;
    Widget key(Widget label, VoidCallback onTap, {Key? k}) => Padding(
      padding: const EdgeInsets.all(6),
      child: SizedBox(
        width: 76,
        height: 64,
        child: OutlinedButton(
          key: k,
          style: OutlinedButton.styleFrom(padding: EdgeInsets.zero),
          onPressed: _checking ? null : onTap,
          child: DefaultTextStyle.merge(style: const TextStyle(fontSize: 24), child: label),
        ),
      ),
    );
    return AlertDialog(
      title: Text('${widget.member.name} · ${t['enterPin']}'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            height: 40,
            child: _checking
                ? Center(child: Text(t['checking']))
                : _PinDots(key: const Key('pin-dots'), filled: _pin.length, slots: _pin.length < 4 ? 4 : _pin.length),
          ),
          if (_wrong) Text(t['wrongPin'], style: TextStyle(color: Theme.of(context).colorScheme.error)),
          const SizedBox(height: 12),
          for (final row in const [
            ['1', '2', '3'],
            ['4', '5', '6'],
            ['7', '8', '9'],
          ])
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [for (final d in row) key(Text(d), () => _press(d), k: Key('pin-$d'))],
            ),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              key(
                const Icon(Icons.backspace_outlined, semanticLabel: 'Delete'),
                () => setState(() => _pin = _pin.isEmpty ? '' : _pin.substring(0, _pin.length - 1)),
                k: const Key('pin-back'),
              ),
              key(const Text('0'), () => _press('0'), k: const Key('pin-0')),
              key(const Text('OK'), _submit, k: const Key('pin-ok')),
            ],
          ),
        ],
      ),
      actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(t['cancel']))],
    );
  }
}

/// Entered digits as filled circles, the rest as outlines. Drawn, not typed, so they do not
/// depend on which symbols a font has.
class _PinDots extends StatelessWidget {
  const _PinDots({super.key, required this.filled, required this.slots});

  final int filled;
  final int slots;

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme.onSurface;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < slots; i++)
          Container(
            width: 16,
            height: 16,
            margin: const EdgeInsets.symmetric(horizontal: 8),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: i < filled ? color : null,
              border: Border.all(color: color, width: 2),
            ),
          ),
      ],
    );
  }
}

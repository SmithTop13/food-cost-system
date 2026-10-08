import 'package:flutter/material.dart';

import '../api.dart';
import '../app_controller.dart';
import 'app.dart';

class PairScreen extends StatefulWidget {
  const PairScreen({super.key, required this.controller});

  final AppController controller;

  @override
  State<PairScreen> createState() => _PairScreenState();
}

class _PairScreenState extends State<PairScreen> {
  final _code = TextEditingController();
  final _name = TextEditingController(text: 'POS');
  String _kind = 'POS';
  String? _error;
  bool _busy = false;

  Future<void> _pair() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.controller.pair(code: _code.text, name: _name.text, kind: _kind);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.controller.t;
    return Scaffold(
      appBar: AppBar(actions: [LangButton(controller: widget.controller)]),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: ListView(
            padding: const EdgeInsets.all(24),
            shrinkWrap: true,
            children: [
              Text(t['pairTitle'], style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 8),
              Text(t['pairHelp']),
              const SizedBox(height: 24),
              TextField(
                key: const Key('pair-code'),
                controller: _code,
                textCapitalization: TextCapitalization.characters,
                style: const TextStyle(fontSize: 28, letterSpacing: 4),
                decoration: InputDecoration(labelText: t['pairingCode'], hintText: 'XXXX-XXXX', border: const OutlineInputBorder()),
              ),
              const SizedBox(height: 16),
              TextField(
                key: const Key('pair-name'),
                controller: _name,
                decoration: InputDecoration(labelText: t['deviceName'], border: const OutlineInputBorder()),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: _kind,
                decoration: InputDecoration(labelText: t['deviceKind'], border: const OutlineInputBorder()),
                items: const [
                  DropdownMenuItem(value: 'POS', child: Text('POS')),
                  DropdownMenuItem(value: 'WAITER', child: Text('Waiter')),
                  DropdownMenuItem(value: 'KDS', child: Text('Kitchen display')),
                ],
                onChanged: (v) => setState(() => _kind = v ?? 'POS'),
              ),
              if (_error != null) ...[
                const SizedBox(height: 16),
                Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ],
              const SizedBox(height: 24),
              FilledButton(
                key: const Key('pair-submit'),
                onPressed: _busy ? null : _pair,
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
                child: Text(t['pair']),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

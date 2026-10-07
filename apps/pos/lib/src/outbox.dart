import 'dart:convert';

import 'store.dart';

/// Events this device created, kept until the branch hub confirms them (sync engine, S3).
/// Each event uses the sync log format of packages/sync-core (`SyncEvent`).
class Outbox {
  Outbox(this._store);

  static const _key = 'outbox.events';
  final DeviceStore _store;
  List<Map<String, dynamic>>? _events;

  Future<List<Map<String, dynamic>>> events() async {
    if (_events case final events?) return List.unmodifiable(events);
    final raw = await _store.read(_key);
    _events = raw == null ? [] : (jsonDecode(raw) as List<dynamic>).cast<Map<String, dynamic>>();
    return List.unmodifiable(_events!);
  }

  /// Appends all events or none: they are written in one go.
  Future<void> addAll(List<Map<String, dynamic>> newEvents) async {
    final current = [...await events(), ...newEvents];
    await _store.write(_key, jsonEncode(current));
    _events = current;
  }
}

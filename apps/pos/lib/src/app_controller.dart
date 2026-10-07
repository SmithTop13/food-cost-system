import 'dart:convert';

import 'package:flutter/foundation.dart';

import 'api.dart';
import 'i18n.dart';
import 'models.dart';
import 'order.dart';
import 'outbox.dart';
import 'pin.dart';
import 'store.dart';
import 'ulid.dart';

enum Stage { loading, unpaired, signedOut, ordering }

/// Checks a PIN off the UI thread. Replaced in tests to avoid the deliberate scrypt delay.
typedef PinVerifier = Future<bool> Function(String pin, String hash);

Future<bool> verifyPinInBackground(String pin, String hash) => compute(verifyPinIsolate, (pin, hash));

/// App state: pairing, the cached menu and roster, who is signed in, and the order outbox.
/// Works offline: the last downloaded menu and roster are kept on the device.
class AppController extends ChangeNotifier {
  AppController({required this.api, required this.store, PinVerifier? verifyPin, String Function()? newId, int Function()? now})
    : verifyPin = verifyPin ?? verifyPinInBackground,
      newId = newId ?? createUlidFactory(),
      now = now ?? (() => DateTime.now().millisecondsSinceEpoch),
      outbox = Outbox(store);

  final PosApi api;
  final DeviceStore store;
  final PinVerifier verifyPin;
  final String Function() newId;
  final int Function() now;
  final Outbox outbox;

  Stage stage = Stage.loading;
  Lang lang = Lang.th;
  DeviceCredentials? credentials;
  BranchMenu? menu;
  Roster? roster;
  StaffMember? staff;

  /// True when the last refresh could not reach the cloud; the saved menu is in use.
  bool offline = false;
  int pendingEvents = 0;
  late final OrderDraft draft = OrderDraft(newId: newId);

  Strings get t => Strings.of(lang);

  void toggleLang() {
    lang = lang == Lang.th ? Lang.en : Lang.th;
    notifyListeners();
  }

  Future<void> start() async {
    credentials = await store.loadCredentials();
    if (credentials == null) {
      stage = Stage.unpaired;
      notifyListeners();
      return;
    }
    await _loadCached();
    pendingEvents = (await outbox.events()).length;
    stage = Stage.signedOut;
    notifyListeners();
    await refresh();
  }

  /// Pair with a code from the owner dashboard. Throws ApiException with the server's message.
  Future<void> pair({required String code, required String name, required String kind}) async {
    final result = await api.pair(code: code.trim(), name: name.trim(), kind: kind);
    credentials = DeviceCredentials(deviceId: result.deviceId, branchId: result.branchId, token: result.token);
    await store.saveCredentials(credentials!);
    stage = Stage.signedOut;
    notifyListeners();
    await refresh();
  }

  /// Download the menu (skipped when unchanged) and the staff roster. Offline is not an error.
  Future<void> refresh() async {
    final token = credentials?.token;
    if (token == null) return;
    try {
      final download = await api.fetchMenu(token, etag: await store.read('menu.etag'));
      if (download.json case final json?) {
        menu = BranchMenu.fromJson(json);
        await store.write('menu.json', jsonEncode(json));
        if (download.etag case final etag?) await store.write('menu.etag', etag);
      }
      final rosterJson = await api.fetchRoster(token);
      roster = Roster.fromJson(rosterJson);
      await store.write('roster.json', jsonEncode(rosterJson));
      offline = false;
    } on ApiException catch (e) {
      if (e.status == 401) {
        // Retired on the dashboard (lost or replaced tablet): back to pairing.
        await store.clearCredentials();
        credentials = null;
        staff = null;
        stage = Stage.unpaired;
      } else {
        offline = true;
      }
    } catch (_) {
      offline = true; // no network: keep working from the saved copy
    }
    notifyListeners();
  }

  Future<void> _loadCached() async {
    if (await store.read('menu.json') case final raw?) menu = BranchMenu.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    if (await store.read('roster.json') case final raw?) roster = Roster.fromJson(jsonDecode(raw) as Map<String, dynamic>);
  }

  /// Returns true and opens the order screen if [pin] is [member]'s PIN. Checked on the device.
  Future<bool> signIn(StaffMember member, String pin) async {
    if (!await verifyPin(pin, member.pinHash)) return false;
    staff = member;
    stage = Stage.ordering;
    notifyListeners();
    return true;
  }

  void signOut() {
    staff = null;
    draft.clear();
    stage = Stage.signedOut;
    notifyListeners();
  }

  /// Saves the order's events to the outbox (sent to the hub by the sync engine) and clears the draft.
  Future<void> sendOrder() async {
    final who = staff;
    final device = credentials;
    if (who == null || device == null || draft.isEmpty) return;
    final events = draft.toEvents(deviceId: device.deviceId, staffId: who.id, createdAt: now());
    await outbox.addAll(events);
    pendingEvents = (await outbox.events()).length;
    draft.clear();
    notifyListeners();
  }
}

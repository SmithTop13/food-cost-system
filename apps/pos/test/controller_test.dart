import 'package:fcs_pos/src/app_controller.dart';
import 'package:fcs_pos/src/store.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

AppController controllerWith(FakePosApi api, MemoryDeviceStore store) {
  var n = 0;
  return AppController(
    api: api,
    store: store,
    verifyPin: (pin, hash) async => hash == sampleRosterJson()['staff'][0]['pinHash'] && pin == '4821',
    newId: () => 'id${++n}',
    now: () => 1790000000000,
  );
}

void main() {
  test('starts unpaired, pairs, then downloads and saves the menu and roster', () async {
    final api = FakePosApi();
    final store = MemoryDeviceStore();
    final c = controllerWith(api, store);
    await c.start();
    expect(c.stage, Stage.unpaired);

    await c.pair(code: 'k7qm-3xrp', name: 'POS 1', kind: 'POS');
    expect(c.stage, Stage.signedOut);
    expect(store.credentials?.token, 'token-1');
    expect(c.menu?.items, hasLength(5));
    expect(c.roster?.staff.map((s) => s.name), ['น้อย', 'แดง']);
    expect(store.values['menu.etag'], '"menu-3"');
  });

  test('a restart works offline from the saved menu and roster', () async {
    final api = FakePosApi();
    final store = MemoryDeviceStore();
    await controllerWith(api, store).pair(code: 'K7QM-3XRP', name: 'POS', kind: 'POS');

    api.online = false;
    final c = controllerWith(api, store);
    await c.start();
    expect(c.stage, Stage.signedOut);
    expect(c.offline, isTrue);
    expect(c.menu?.branchName, 'บ้านกะเพรา อารีย์');
    expect(await c.signIn(c.roster!.staff.first, '4821'), isTrue);
  });

  test('does not download an unchanged menu again', () async {
    final api = FakePosApi();
    final store = MemoryDeviceStore();
    final c = controllerWith(api, store);
    await c.pair(code: 'K7QM-3XRP', name: 'POS', kind: 'POS');
    await c.refresh();
    expect(api.menuDownloads, 1);
    api.menu = sampleMenuJson(version: 4);
    await c.refresh();
    expect(api.menuDownloads, 2);
  });

  test('a device retired on the dashboard goes back to pairing', () async {
    final api = FakePosApi();
    final store = MemoryDeviceStore();
    final c = controllerWith(api, store);
    await c.pair(code: 'K7QM-3XRP', name: 'POS', kind: 'POS');
    api.revoked = true;
    await c.refresh();
    expect(c.stage, Stage.unpaired);
    expect(store.credentials, isNull);
  });

  test('wrong PIN keeps you signed out; sending an order saves its events and clears the draft', () async {
    final api = FakePosApi();
    final store = MemoryDeviceStore();
    final c = controllerWith(api, store);
    await c.pair(code: 'K7QM-3XRP', name: 'POS', kind: 'POS');
    final nok = c.roster!.staff.first;
    expect(await c.signIn(nok, '1111'), isFalse);
    expect(c.stage, Stage.signedOut);
    expect(await c.signIn(nok, '4821'), isTrue);

    c.draft.add(c.menu!.items.firstWhere((i) => i.id == 'thaitea'));
    await c.sendOrder();
    expect(c.draft.isEmpty, isTrue);
    expect(c.pendingEvents, 3);
    final restarted = controllerWith(api, store);
    await restarted.start();
    expect(restarted.pendingEvents, 3); // survives a restart
  });
}

import 'package:fcs_pos/src/app_controller.dart';
import 'package:fcs_pos/src/store.dart';
import 'package:fcs_pos/src/ui/app.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

/// Sprint S2 demo: "a waiter enters a 5-item order in under 20 seconds".
///
/// Real speed needs real staff on a real tablet. Here we count taps, the main cost: at a
/// working pace of about 1.5 s per tap, 12 taps ≈ 18 s.
const tapBudget = 12;

Future<AppController> pairedController(WidgetTester tester, {required Size size}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final api = FakePosApi();
  final store = MemoryDeviceStore();
  var n = 0;
  final c = AppController(
    api: api,
    store: store,
    // Real PIN check in pin_test.dart; skipped here so the UI test is not slowed by scrypt.
    verifyPin: (pin, hash) async => pin == '4821' && hash == sampleRosterJson()['staff'][0]['pinHash'],
    newId: () => 'id${(++n).toString().padLeft(3, '0')}',
    now: () => 1790000000000,
  );
  await tester.pumpWidget(PosApp(controller: c));
  await c.start();
  await tester.pumpAndSettle();
  return c;
}

void main() {
  testWidgets('pair, sign in with a PIN, enter a 5-item order and send it', (tester) async {
    final c = await pairedController(tester, size: const Size(1280, 800));

    // Pair with the code from the dashboard.
    expect(find.text('เชื่อมต่ออุปกรณ์นี้'), findsOneWidget); // opens in Thai
    await tester.tap(find.byKey(const Key('lang')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('pair-code')), 'WRONG-CODE');
    await tester.tap(find.byKey(const Key('pair-submit')));
    await tester.pumpAndSettle();
    expect(find.text('pairing code is wrong, used or expired'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('pair-code')), 'k7qm-3xrp');
    await tester.tap(find.byKey(const Key('pair-submit')));
    await tester.pumpAndSettle();

    // Sign in: tap your name, then the PIN. A wrong PIN is refused.
    expect(find.text('Who is working?'), findsOneWidget);
    await tester.tap(find.byKey(const Key('staff-staff-nok')));
    await tester.pumpAndSettle();
    for (final d in '1111'.split('')) {
      await tester.tap(find.byKey(Key('pin-$d')));
    }
    await tester.tap(find.byKey(const Key('pin-ok')));
    await tester.pumpAndSettle();
    expect(find.text('Wrong PIN'), findsOneWidget);
    for (final d in '4821'.split('')) {
      await tester.tap(find.byKey(Key('pin-$d')));
    }
    await tester.tap(find.byKey(const Key('pin-ok')));
    await tester.pumpAndSettle();
    expect(find.textContaining('น้อย'), findsWidgets); // signed in as Nok
    expect(find.text('Sold out'), findsOneWidget); // pad see ew is 86'd

    // --- The order. Every tap counts. ---
    var taps = 0;
    Future<void> tap(Finder f) async {
      taps++;
      await tester.tap(f);
      await tester.pumpAndSettle();
    }

    // 2 × kaphrao, Thai hot, fried egg: dish, spice, extra, Add, then + on the line.
    await tap(find.byKey(const Key('item-kaphrao')));
    expect(find.byKey(const Key('modifier-add')), findsOneWidget);
    expect(tester.widget<FilledButton>(find.byKey(const Key('modifier-add'))).onPressed, isNull); // spice is required
    await tap(find.byKey(const Key('opt-hot')));
    await tap(find.byKey(const Key('opt-egg')));
    await tap(find.byKey(const Key('modifier-add')));
    await tap(find.byKey(const Key('inc-id001')));
    // 1 × shrimp fried rice (no choices: one tap).
    await tap(find.byKey(const Key('item-friedrice')));
    // 2 × Thai iced tea (tapping again raises the quantity).
    await tap(find.byKey(const Key('item-thaitea')));
    await tap(find.byKey(const Key('item-thaitea')));
    // Table 5.
    await tap(find.byKey(const Key('table')));
    await tester.enterText(find.byKey(const Key('table')), '5');
    taps++; // typing one digit
    await tester.pumpAndSettle();

    expect(c.draft.itemCount, 5);
    // 2×70 + 85 + 2×45 = 315.00; service charge 31.50; VAT 7% of 346.50 = 24.255 → 24.26;
    // 370.76 → nearest 0.25 = 370.75.
    expect(tester.widget<Text>(find.byKey(const Key('total'))).data, '370.75');

    await tap(find.byKey(const Key('send')));
    expect(find.text('Order sent'), findsOneWidget);

    expect(taps, lessThanOrEqualTo(tapBudget), reason: 'order entry took $taps taps');
    // ignore: avoid_print
    print('S2 demo: 5 items with modifiers and a table in $taps taps (budget $tapBudget)');

    // Saved for the sync engine: open, three lines, fire.
    final events = await c.outbox.events();
    expect(events.map((e) => e['type']), ['ORDER_OPENED', 'ITEM_ADDED', 'ITEM_ADDED', 'ITEM_ADDED', 'ITEMS_FIRED']);
    expect((events[0]['payload'] as Map)['tableId'], '5');
    expect(events.where((e) => e['type'] == 'ITEM_ADDED').map((e) => (e['payload'] as Map)['quantity']), [2, 1, 2]);
    expect(find.byKey(const Key('pending')), findsOneWidget);
    expect(c.draft.isEmpty, isTrue);
  });

  testWidgets('sold-out dishes cannot be added; a required choice must be made', (tester) async {
    final c = await pairedController(tester, size: const Size(1280, 800));
    await c.pair(code: 'K7QM-3XRP', name: 'POS', kind: 'POS');
    await c.signIn(c.roster!.staff.first, '4821');
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('item-padseeew')));
    await tester.pumpAndSettle();
    expect(c.draft.isEmpty, isTrue);

    await tester.tap(find.byKey(const Key('item-kaphrao')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('opt-egg')));
    await tester.tap(find.byKey(const Key('opt-omelette')));
    await tester.tap(find.byKey(const Key('opt-rice'))); // a third extra is beyond the limit of 2
    await tester.pumpAndSettle();
    final chips = tester.widgetList<FilterChip>(find.byType(FilterChip)).where((chip) => chip.selected).toList();
    expect(chips, hasLength(2));
    expect(tester.widget<FilledButton>(find.byKey(const Key('modifier-add'))).onPressed, isNull); // no spice yet
    await tester.tap(find.byKey(const Key('opt-mild')));
    await tester.tap(find.byKey(const Key('opt-hot'))); // single choice: switches
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('modifier-add')));
    await tester.pumpAndSettle();
    expect(c.draft.lines.single.options.map((o) => o.option.id), ['hot', 'egg', 'omelette']);
  });

  testWidgets('phone layout: the order opens from a bar at the bottom', (tester) async {
    final c = await pairedController(tester, size: const Size(390, 844));
    await c.pair(code: 'K7QM-3XRP', name: 'POS', kind: 'POS');
    await c.signIn(c.roster!.staff.first, '4821');
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('item-thaitea')));
    await tester.pumpAndSettle();
    // 45.00 + 10% service = 49.50; VAT 3.465 → 3.47; 52.97 → nearest 0.25 = 53.00.
    expect(find.textContaining('(1) · 53.00'), findsOneWidget);
    await tester.tap(find.byKey(const Key('view-order')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('send')));
    await tester.pumpAndSettle();
    expect(c.pendingEvents, 3);
    expect(tester.takeException(), isNull); // no layout overflow
  });
}

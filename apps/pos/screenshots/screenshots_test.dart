// Renders the POS screens with the real bundled fonts, for docs/screenshots.
// Not part of the normal test run. Regenerate with:
//   flutter test screenshots --update-goldens && cp screenshots/*.png ../../docs/screenshots/
import 'dart:io';

import 'package:fcs_pos/src/app_controller.dart';
import 'package:fcs_pos/src/i18n.dart';
import 'package:fcs_pos/src/models.dart';
import 'package:fcs_pos/src/store.dart';
import 'package:fcs_pos/src/ui/app.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import '../test/fakes.dart';

Future<void> loadFont(String family, List<String> paths) async {
  final loader = FontLoader(family);
  for (final p in paths) {
    loader.addFont(Future.value(ByteData.sublistView(File(p).readAsBytesSync())));
  }
  await loader.load();
}

void main() {
  setUpAll(() async {
    await loadFont('NotoSansThai', ['assets/fonts/NotoSansThai.ttf']);
    await loadFont('NotoSans', ['assets/fonts/NotoSans.ttf']);
    final flutterRoot = Platform.environment['FLUTTER_ROOT'] ?? '/opt/flutter';
    await loadFont('MaterialIcons', ['$flutterRoot/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf']);
  });

  Future<AppController> signedIn(WidgetTester tester, Size size, {Lang lang = Lang.th}) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    var n = 0;
    final c = AppController(
      api: FakePosApi(),
      store: MemoryDeviceStore(),
      verifyPin: (_, _) async => true,
      newId: () => 'id${(++n).toString().padLeft(3, '0')}',
    );
    if (lang != c.lang) c.toggleLang();
    await tester.pumpWidget(PosApp(controller: c));
    await c.start();
    await c.pair(code: 'K7QM-3XRP', name: 'POS', kind: 'POS');
    await tester.pumpAndSettle();
    return c;
  }

  void fillOrder(AppController c) {
    final menu = c.menu!;
    MenuItem item(String id) => menu.items.firstWhere((i) => i.id == id);
    final spice = menu.modifierGroups['spice']!;
    final extras = menu.modifierGroups['extras']!;
    c.draft
      ..setTable('5')
      ..add(item('kaphrao'), [(group: spice, option: spice.options[1]), (group: extras, option: extras.options[0])])
      ..add(item('kaphrao'), [(group: spice, option: spice.options[1]), (group: extras, option: extras.options[0])])
      ..add(item('friedrice'))
      ..add(item('thaitea'))
      ..add(item('thaitea'));
    c.draft.setNote(c.draft.lines.last, 'หวานน้อย');
  }

  testWidgets('order screen, tablet', (tester) async {
    final c = await signedIn(tester, const Size(1280, 800));
    await c.signIn(c.roster!.staff.first, '');
    fillOrder(c);
    await tester.pumpAndSettle();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('pos-order-tablet.png'));
  });

  testWidgets('modifier choice, tablet', (tester) async {
    final c = await signedIn(tester, const Size(1280, 800));
    await c.signIn(c.roster!.staff.first, '');
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('item-kaphrao')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('opt-hot')));
    await tester.tap(find.byKey(const Key('opt-egg')));
    await tester.pumpAndSettle();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('pos-modifiers-tablet.png'));
  });

  testWidgets('staff sign-in with PIN pad', (tester) async {
    await signedIn(tester, const Size(1280, 800));
    await tester.tap(find.byKey(const Key('staff-staff-nok')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('pin-4')));
    await tester.tap(find.byKey(const Key('pin-8')));
    await tester.pumpAndSettle();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('pos-pin.png'));
  });

  testWidgets('order screen, phone, English', (tester) async {
    final c = await signedIn(tester, const Size(390, 844), lang: Lang.en);
    await c.signIn(c.roster!.staff.first, '');
    fillOrder(c);
    await tester.pumpAndSettle();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('pos-order-phone-en.png'));
  });
}

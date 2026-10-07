import 'package:flutter/material.dart';

import '../app_controller.dart';
import 'order_screen.dart';
import 'pair_screen.dart';
import 'staff_screen.dart';

const brand = Color(0xFFB5452B);

ThemeData posTheme(Brightness brightness) {
  final scheme = ColorScheme.fromSeed(seedColor: brand, brightness: brightness);
  return ThemeData(
    colorScheme: scheme,
    useMaterial3: true,
    // Bundled so Thai renders the same on every tablet, online or not.
    fontFamily: 'NotoSansThai',
    fontFamilyFallback: const ['NotoSans'],
    visualDensity: VisualDensity.standard,
  );
}

class PosApp extends StatelessWidget {
  const PosApp({super.key, required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) => MaterialApp(
        title: 'POS',
        debugShowCheckedModeBanner: false,
        theme: posTheme(Brightness.light),
        darkTheme: posTheme(Brightness.dark),
        home: switch (controller.stage) {
          Stage.loading => const Scaffold(body: Center(child: CircularProgressIndicator())),
          Stage.unpaired => PairScreen(controller: controller),
          Stage.signedOut => StaffScreen(controller: controller),
          Stage.ordering => OrderScreen(controller: controller),
        },
      ),
    );
  }
}

/// Language switch shown on every screen.
class LangButton extends StatelessWidget {
  const LangButton({super.key, required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) =>
      TextButton(key: const Key('lang'), onPressed: controller.toggleLang, child: Text(controller.lang.name == 'th' ? 'EN' : 'ไทย'));
}

import 'package:flutter/material.dart';

import 'src/api.dart';
import 'src/app_controller.dart';
import 'src/store.dart';
import 'src/ui/app.dart';

/// Build with --dart-define=API_URL=https://api.example.com
const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://localhost:3000');

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final controller = AppController(api: HttpPosApi(Uri.parse(apiUrl)), store: PlatformDeviceStore());
  runApp(PosApp(controller: controller));
  controller.start();
}

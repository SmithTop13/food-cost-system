import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

class DeviceCredentials {
  DeviceCredentials({required this.deviceId, required this.branchId, required this.token});

  final String deviceId;
  final String branchId;
  final String token;
}

/// Everything the POS keeps on the device. The token goes to the platform's secure store
/// (Keychain / Keystore); the rest is ordinary app data.
// TODO(S3): move the order outbox to SQLite with the sync engine's local log.
abstract class DeviceStore {
  Future<DeviceCredentials?> loadCredentials();
  Future<void> saveCredentials(DeviceCredentials credentials);
  Future<void> clearCredentials();
  Future<String?> read(String key);
  Future<void> write(String key, String value);
}

class PlatformDeviceStore implements DeviceStore {
  PlatformDeviceStore({FlutterSecureStorage? secure}) : _secure = secure ?? const FlutterSecureStorage();

  final FlutterSecureStorage _secure;

  @override
  Future<DeviceCredentials?> loadCredentials() async {
    final token = await _secure.read(key: 'device.token');
    final deviceId = await _secure.read(key: 'device.id');
    final branchId = await _secure.read(key: 'device.branchId');
    if (token == null || deviceId == null || branchId == null) return null;
    return DeviceCredentials(deviceId: deviceId, branchId: branchId, token: token);
  }

  @override
  Future<void> saveCredentials(DeviceCredentials c) async {
    await _secure.write(key: 'device.token', value: c.token);
    await _secure.write(key: 'device.id', value: c.deviceId);
    await _secure.write(key: 'device.branchId', value: c.branchId);
  }

  @override
  Future<void> clearCredentials() async {
    for (final key in ['device.token', 'device.id', 'device.branchId']) {
      await _secure.delete(key: key);
    }
  }

  @override
  Future<String?> read(String key) async => (await SharedPreferences.getInstance()).getString(key);

  @override
  Future<void> write(String key, String value) async => (await SharedPreferences.getInstance()).setString(key, value);
}

/// For tests and previews.
class MemoryDeviceStore implements DeviceStore {
  DeviceCredentials? credentials;
  final Map<String, String> values = {};

  @override
  Future<DeviceCredentials?> loadCredentials() async => credentials;

  @override
  Future<void> saveCredentials(DeviceCredentials c) async => credentials = c;

  @override
  Future<void> clearCredentials() async => credentials = null;

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async => values[key] = value;
}

import 'dart:convert';
import 'dart:typed_data';

import 'package:pointycastle/export.dart';

/// Check a PIN against a hash from the server (`scrypt$N$r$p$salt$hash`, base64url, as written
/// by services/api/src/crypto.ts). Runs fully offline. Slow on purpose (scrypt): call it off
/// the UI thread (see `compute`).
bool verifyPin(String pin, String stored) {
  final parts = stored.split(r'$');
  if (parts.length != 6 || parts[0] != 'scrypt') return false;
  final n = int.tryParse(parts[1]);
  final r = int.tryParse(parts[2]);
  final p = int.tryParse(parts[3]);
  if (n == null || r == null || p == null) return false;
  final salt = _b64url(parts[4]);
  final expected = _b64url(parts[5]);

  final scrypt = Scrypt()..init(ScryptParameters(n, r, p, expected.length, salt));
  final actual = scrypt.process(Uint8List.fromList(utf8.encode(pin)));
  return _constantTimeEquals(actual, expected);
}

/// For `compute(...)`, which passes one argument.
bool verifyPinIsolate((String, String) args) => verifyPin(args.$1, args.$2);

Uint8List _b64url(String text) => base64Url.decode(base64Url.normalize(text));

bool _constantTimeEquals(Uint8List a, Uint8List b) {
  if (a.length != b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff == 0;
}

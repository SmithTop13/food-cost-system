import 'package:fcs_pos/src/pin.dart';
import 'package:flutter_test/flutter_test.dart';

import 'node_pin_hashes.dart';

void main() {
  test('accepts the right PIN for hashes made by the API (Node scrypt)', () {
    for (final h in nodePinHashes) {
      expect(verifyPin(h.pin, h.hash), isTrue, reason: h.pin);
    }
  });

  test('rejects a wrong PIN, another person\'s hash, and malformed hashes', () {
    expect(verifyPin('4822', nodePinHashes[0].hash), isFalse);
    expect(verifyPin('4821', nodePinHashes[1].hash), isFalse);
    expect(verifyPin('4821', 'plain-4821'), isFalse);
    expect(verifyPin('4821', r'scrypt$x$8$1$AAAA$AAAA'), isFalse);
  });
}

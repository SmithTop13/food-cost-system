import 'dart:math';

const _encoding = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32

/// Monotonic ULID factory; same format as packages/sync-core/src/ulid.ts.
String Function() createUlidFactory({int Function()? now, Random? random}) {
  final clock = now ?? () => DateTime.now().millisecondsSinceEpoch;
  final rng = random ?? Random.secure();
  var lastTime = -1;
  var lastRandom = <int>[];

  return () {
    var time = clock();
    if (time < lastTime) time = lastTime; // clock moved backwards: stay monotonic
    if (time == lastTime) {
      lastRandom = _increment(lastRandom);
    } else {
      lastTime = time;
      lastRandom = List<int>.generate(16, (_) => rng.nextInt(32));
    }
    return _encodeTime(time) + lastRandom.map((d) => _encoding[d]).join();
  };
}

String _encodeTime(int time) {
  final out = StringBuffer();
  final chars = List<String>.filled(10, '0');
  for (var i = 9; i >= 0; i--) {
    chars[i] = _encoding[time % 32];
    time ~/= 32;
  }
  out.writeAll(chars);
  return out.toString();
}

List<int> _increment(List<int> digits) {
  final next = [...digits];
  for (var i = next.length - 1; i >= 0; i--) {
    if (next[i] < 31) {
      next[i]++;
      return next;
    }
    next[i] = 0;
  }
  throw StateError('ULID random component overflowed within one millisecond');
}

/// Amounts are whole satang (1 THB = 100 satang): non-negative integers.
/// Rates are basis points: 700 = 7%.
const int bpDenominator = 10000;

void assertSatang(int value, String label) {
  if (value < 0) {
    throw RangeError('$label must be a non-negative integer number of satang, got $value');
  }
}

void assertBasisPoints(int value, String label, [int max = bpDenominator]) {
  if (value < 0 || value > max) {
    throw RangeError('$label must be an integer between 0 and $max basis points, got $value');
  }
}

int _toInt(BigInt value) {
  if (!value.isValidInt) throw RangeError('amount out of range: $value');
  return value.toInt();
}

/// round(numerator / denominator) with halves rounded up. Inputs must be non-negative.
int divRoundHalfUp(BigInt numerator, BigInt denominator) =>
    _toInt((numerator * BigInt.two + denominator) ~/ (denominator * BigInt.two));

/// amount × rate, rounded half-up to the satang.
int applyRate(int amount, int rate) =>
    divRoundHalfUp(BigInt.from(amount) * BigInt.from(rate), BigInt.from(bpDenominator));

/// VAT contained in a VAT-inclusive amount: amount × rate / (1 + rate), rounded half-up.
int includedTax(int amount, int rate) =>
    divRoundHalfUp(BigInt.from(amount) * BigInt.from(rate), BigInt.from(bpDenominator + rate));

/// Split [total] into integer parts proportional to [weights] (largest-remainder method).
/// Parts always sum to [total]. Ties in remainder go to the earliest index.
/// If every weight is zero, the total is split as evenly as possible.
List<int> allocate(int total, List<int> weights) {
  if (weights.isEmpty) {
    if (total != 0) throw RangeError('cannot allocate a non-zero total across zero parts');
    return [];
  }
  final weightSum = weights.fold<BigInt>(BigInt.zero, (a, b) => a + BigInt.from(b));
  final effective =
      weightSum == BigInt.zero ? List<BigInt>.filled(weights.length, BigInt.one) : weights.map(BigInt.from).toList();
  final denominator = weightSum == BigInt.zero ? BigInt.from(weights.length) : weightSum;
  final t = BigInt.from(total);

  final parts = [for (final w in effective) (t * w) ~/ denominator];
  final remainders = [for (var i = 0; i < effective.length; i++) (i: i, r: (t * effective[i]) % denominator)];
  var left = t - parts.fold<BigInt>(BigInt.zero, (a, b) => a + b);
  remainders.sort((a, b) => a.r == b.r ? a.i - b.i : b.r.compareTo(a.r));
  for (final entry in remainders) {
    if (left == BigInt.zero) break;
    parts[entry.i] += BigInt.one;
    left -= BigInt.one;
  }
  return parts.map(_toInt).toList();
}

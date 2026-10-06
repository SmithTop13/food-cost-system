/** Whole satang (1 THB = 100 satang). Always a non-negative safe integer in this package. */
export type Satang = number;

/** Rate in basis points: 700 = 7%. */
export type BasisPoints = number;

export const BP_DENOMINATOR = 10_000;

export function assertSatang(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer number of satang, got ${value}`);
  }
}

export function assertBasisPoints(value: number, label: string, max = BP_DENOMINATOR): void {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new RangeError(`${label} must be an integer between 0 and ${max} basis points, got ${value}`);
  }
}

function toNumber(value: bigint): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new RangeError(`amount out of range: ${value}`);
  return n;
}

/** round(numerator / denominator) with halves rounded up. Inputs must be non-negative. */
export function divRoundHalfUp(numerator: bigint, denominator: bigint): number {
  return toNumber((numerator * 2n + denominator) / (denominator * 2n));
}

/** amount × rate, rounded half-up to the satang. */
export function applyRate(amount: Satang, rate: BasisPoints): Satang {
  return divRoundHalfUp(BigInt(amount) * BigInt(rate), BigInt(BP_DENOMINATOR));
}

/** VAT contained in a VAT-inclusive amount: amount × rate / (1 + rate), rounded half-up. */
export function includedTax(amount: Satang, rate: BasisPoints): Satang {
  return divRoundHalfUp(BigInt(amount) * BigInt(rate), BigInt(BP_DENOMINATOR + rate));
}

/**
 * Split `total` into integer parts proportional to `weights` (largest-remainder method).
 * Parts always sum to `total`. Ties in remainder go to the earliest index.
 * If every weight is zero, the total is split as evenly as possible.
 */
export function allocate(total: number, weights: readonly number[]): number[] {
  if (weights.length === 0) {
    if (total !== 0) throw new RangeError("cannot allocate a non-zero total across zero parts");
    return [];
  }
  const weightSum = weights.reduce((a, b) => a + BigInt(b), 0n);
  const effective = weightSum === 0n ? weights.map(() => 1n) : weights.map((w) => BigInt(w));
  const denominator = weightSum === 0n ? BigInt(weights.length) : weightSum;
  const t = BigInt(total);

  const parts = effective.map((w) => (t * w) / denominator);
  const remainders = effective.map((w, i) => ({ i, r: (t * w) % denominator }));
  let left = t - parts.reduce((a, b) => a + b, 0n);
  remainders.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (const { i } of remainders) {
    if (left === 0n) break;
    parts[i] = parts[i]! + 1n;
    left -= 1n;
  }
  return parts.map(toNumber);
}

const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32
const TIME_LEN = 10;
const RANDOM_LEN = 16;

export interface UlidSource {
  now: () => number;
  /** Uniform in [0, 1). */
  random: () => number;
}

/**
 * Monotonic ULID factory: IDs sort by creation time on one device, and IDs created in the
 * same millisecond keep increasing. Uniqueness across devices comes from 80 random bits.
 */
export function createUlidFactory(source: UlidSource = { now: Date.now, random: Math.random }): () => string {
  let lastTime = -1;
  let lastRandom: number[] = [];

  return () => {
    let time = Math.floor(source.now());
    if (time < lastTime) time = lastTime; // clock moved backwards: stay monotonic
    if (time === lastTime) {
      lastRandom = increment(lastRandom);
    } else {
      lastTime = time;
      lastRandom = Array.from({ length: RANDOM_LEN }, () => Math.floor(source.random() * 32));
    }
    return encodeTime(time) + lastRandom.map((d) => ENCODING[d]).join("");
  };
}

function encodeTime(time: number): string {
  if (time < 0 || time > 2 ** 48 - 1) throw new RangeError(`ULID time out of range: ${time}`);
  let out = "";
  for (let i = 0; i < TIME_LEN; i++) {
    out = ENCODING[time % 32] + out;
    time = Math.floor(time / 32);
  }
  return out;
}

function increment(digits: number[]): number[] {
  const next = digits.slice();
  for (let i = next.length - 1; i >= 0; i--) {
    if (next[i]! < 31) {
      next[i] = next[i]! + 1;
      return next;
    }
    next[i] = 0;
  }
  throw new RangeError("ULID random component overflowed within one millisecond");
}

import { describe, expect, it } from "vitest";
import { createUlidFactory } from "../src/ulid.js";

describe("ULID", () => {
  it("is 26 Crockford base32 characters and increases within one millisecond", () => {
    const next = createUlidFactory({ now: () => 1_790_000_000_000, random: () => 0.5 });
    const ids = Array.from({ length: 50 }, next);
    expect(ids.every((id) => /^[0-9A-HJKMNP-TV-Z]{26}$/.test(id))).toBe(true);
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("stays monotonic when the device clock jumps backwards", () => {
    let t = 1_790_000_000_000;
    const next = createUlidFactory({ now: () => t, random: Math.random });
    const first = next();
    t -= 60_000;
    expect(next() > first).toBe(true);
  });
});

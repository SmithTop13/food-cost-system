import { describe, expect, it } from "vitest";
import { formatBaht, parseBaht, parseOptions } from "../lib/money";

describe("parseBaht", () => {
  it.each([
    ["60", 6000],
    ["60.5", 6050],
    ["60.50", 6050],
    ["0.05", 5],
    [" 1,234.50 ", 123450],
    ["0", 0],
  ])("%s → %i satang", (input, satang) => {
    expect(parseBaht(input)).toBe(satang);
  });

  it.each(["", "-5", "60.505", "abc", "1e3", "60.", ".5", "12345678"])("rejects %j", (input) => {
    expect(parseBaht(input)).toBeNull();
  });

  it("round-trips with formatBaht", () => {
    for (const satang of [0, 5, 6050, 123450, 99999999]) expect(parseBaht(formatBaht(satang))).toBe(satang);
  });
});

describe("parseOptions", () => {
  it("reads one option per line with an optional price", () => {
    expect(parseOptions("ไข่ดาว, 10\nไม่ใส่ผัก\n\n  พิเศษ, 15.50 ")).toEqual([
      { nameTh: "ไข่ดาว", price: 1000 },
      { nameTh: "ไม่ใส่ผัก", price: 0 },
      { nameTh: "พิเศษ", price: 1550 },
    ]);
  });

  it("uses the last comma, so names may contain commas", () => {
    expect(parseOptions("Egg, fried, 10")).toEqual([{ nameTh: "Egg, fried", price: 1000 }]);
  });

  it("rejects a bad price, an empty name or no options", () => {
    expect(parseOptions("Egg, ten")).toBeNull();
    expect(parseOptions(", 10")).toBeNull();
    expect(parseOptions("  \n ")).toBeNull();
  });
});

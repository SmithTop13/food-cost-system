import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calculateTotals, splitByItems, splitEvenly, type OrderInput, type PricingSettings } from "../src/index.js";

interface Fixture {
  name: string;
  settings?: Partial<PricingSettings>;
  order: OrderInput;
  expected: Record<string, unknown> & { lines?: Record<string, unknown>[] };
  splitEvenly?: { parts: number; expected: number[] };
  splitByItems?: { groups: string[][]; expected: Record<string, unknown>[] };
}

const file = JSON.parse(readFileSync(new URL("../fixtures/totals.json", import.meta.url), "utf8")) as {
  defaults: PricingSettings;
  cases: Fixture[];
};

describe("golden fixtures", () => {
  it("has unique case names", () => {
    const names = file.cases.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  for (const fixture of file.cases) {
    describe(fixture.name, () => {
      const settings: PricingSettings = { ...file.defaults, ...fixture.settings };
      const totals = calculateTotals(fixture.order, settings);

      it("matches expected totals", () => {
        const { lines: expectedLines, ...expectedTotals } = fixture.expected;
        expect(totals).toMatchObject(expectedTotals);
        if (expectedLines) {
          for (const line of expectedLines) {
            expect(totals.lines.find((l) => l.id === line["id"])).toMatchObject(line);
          }
        }
      });

      if (fixture.splitEvenly) {
        const { parts, expected } = fixture.splitEvenly;
        it(`splits evenly into ${parts}`, () => {
          expect(splitEvenly(totals.total, parts, settings.rounding.increment)).toEqual(expected);
        });
      }

      if (fixture.splitByItems) {
        const { groups, expected } = fixture.splitByItems;
        it("splits by items", () => {
          expect(splitByItems(totals, groups, settings)).toEqual(expected);
        });
      }
    });
  }
});

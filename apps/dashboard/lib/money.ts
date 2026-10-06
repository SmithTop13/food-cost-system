/** Satang (integer) → "1,234.50". */
export function formatBaht(satang: number): string {
  return (satang / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * What a person typed as baht → satang. Accepts "60", "60.5", "60.50", "1,234.50".
 * Returns null for anything else (negative, more than 2 decimals, not a number).
 */
export function parseBaht(input: string): number | null {
  const text = input.trim().replace(/,/g, "");
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

/** "Fried egg, 10" per line → options; null if any line is malformed. */
export function parseOptions(text: string): { nameTh: string; price: number }[] | null {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const options = lines.map((line) => {
    const comma = line.lastIndexOf(",");
    const name = (comma < 0 ? line : line.slice(0, comma)).trim();
    const price = comma < 0 ? 0 : parseBaht(line.slice(comma + 1));
    return name && price !== null ? { nameTh: name, price } : null;
  });
  return options.length > 0 && options.every(Boolean) ? (options as { nameTh: string; price: number }[]) : null;
}

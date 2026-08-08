import { describe, expect, it } from "vitest";
import { calculateDocument, calculateLine, type LineInput } from "./calc";
import { formatScaled2, mulDivRoundHalfUp, parseScaled2, percentOf } from "./money";
import { lineInputSchema } from "./schemas";

const line = (over: Partial<LineInput> = {}): LineInput => ({
  quantity: 1,
  unitPriceCents: 0,
  discount: null,
  taxPercent: 0,
  ...over,
});

describe("parseScaled2", () => {
  it("parses strings and numbers into integers scaled by 100", () => {
    expect(parseScaled2("100.00")).toBe(10_000);
    expect(parseScaled2("0.5")).toBe(50);
    expect(parseScaled2(7.5)).toBe(750);
    expect(parseScaled2(0)).toBe(0);
    expect(parseScaled2(" 12.34 ")).toBe(1234);
    expect(parseScaled2("-20")).toBe(-2000);
  });

  it("does not lose the half cent that float multiplication drops", () => {
    expect(parseScaled2("1.005")).toBeNull();
    expect(parseScaled2("1.01")).toBe(101);
  });

  it("rejects malformed, over-precise, and out-of-range input", () => {
    for (const bad of ["", "abc", "1.234", "1e5", "1,5", ".5", null, undefined, NaN, Infinity, 1e21]) {
      expect(parseScaled2(bad)).toBeNull();
    }
  });
});

describe("formatScaled2", () => {
  it("always renders two decimal places", () => {
    expect(formatScaled2(18_900)).toBe("189.00");
    expect(formatScaled2(5)).toBe("0.05");
    expect(formatScaled2(0)).toBe("0.00");
    expect(formatScaled2(-2_000)).toBe("-20.00");
  });
});

describe("mulDivRoundHalfUp", () => {
  it("rounds halves away from zero", () => {
    expect(mulDivRoundHalfUp(5n, 1n, 2n)).toBe(3n);
    expect(mulDivRoundHalfUp(-5n, 1n, 2n)).toBe(-3n);
    expect(mulDivRoundHalfUp(7n, 1n, 2n)).toBe(4n);
    expect(mulDivRoundHalfUp(4n, 1n, 2n)).toBe(2n);
  });

  it("stays exact past Number.MAX_SAFE_INTEGER", () => {
    expect(mulDivRoundHalfUp(9_007_199_254_740_993n, 3n, 1n)).toBe(27_021_597_764_222_979n);
  });
});

describe("percentOf", () => {
  it("applies hundredths-of-a-percent rates with half-up rounding", () => {
    expect(percentOf(18_000, 500)).toBe(900);
    expect(percentOf(10, 500)).toBe(1);
    expect(percentOf(105, 500)).toBe(5);
    expect(percentOf(10_000, 750)).toBe(750);
    expect(percentOf(12_345, 0)).toBe(0);
  });
});

describe("calculateLine", () => {
  it("applies a percent discount before tax", () => {
    expect(
      calculateLine(
        line({ quantity: 2, unitPriceCents: 10_000, discount: { type: "percent", value: 1_000 }, taxPercent: 500 }),
      ),
    ).toEqual({
      subtotalCents: 20_000,
      discountCents: 2_000,
      afterDiscountCents: 18_000,
      taxCents: 900,
      totalCents: 18_900,
    });
  });

  it("handles no discount and no tax", () => {
    expect(calculateLine(line({ quantity: 3, unitPriceCents: 3_333 }))).toEqual({
      subtotalCents: 9_999,
      discountCents: 0,
      afterDiscountCents: 9_999,
      taxCents: 0,
      totalCents: 9_999,
    });
  });

  it("subtracts a fixed discount as-is", () => {
    expect(
      calculateLine(line({ unitPriceCents: 20_000, discount: { type: "fixed", value: 2_000 } })),
    ).toMatchObject({ discountCents: 2_000, afterDiscountCents: 18_000, totalCents: 18_000 });
  });

  it("allows a discount that exactly clears the line", () => {
    expect(
      calculateLine(line({ unitPriceCents: 5_000, discount: { type: "fixed", value: 5_000 }, taxPercent: 500 })),
    ).toMatchObject({ afterDiscountCents: 0, taxCents: 0, totalCents: 0 });
  });

  it("rejects a fixed discount larger than the line subtotal", () => {
    expect(() =>
      calculateLine(line({ unitPriceCents: 5_000, discount: { type: "fixed", value: 5_001 } })),
    ).toThrow(RangeError);
  });

  it("rounds each line independently rather than accumulating fractions", () => {
    expect(calculateLine(line({ quantity: 3, unitPriceCents: 1, taxPercent: 500 }))).toMatchObject({
      subtotalCents: 3,
      taxCents: 0,
      totalCents: 3,
    });
  });
});

describe("calculateDocument — sample from the brief", () => {
  const sample: LineInput[] = [
    line({ quantity: 2, unitPriceCents: 10_000, discount: { type: "percent", value: 1_000 }, taxPercent: 500 }),
    line({ unitPriceCents: 5_000, taxPercent: 500 }),
    line({ unitPriceCents: 20_000, discount: { type: "fixed", value: 2_000 } }),
  ];

  const { lines, totals } = calculateDocument(sample);

  it("matches the expected per-line results", () => {
    expect(lines.map((l) => [l.subtotalCents, l.discountCents, l.afterDiscountCents, l.taxCents, l.totalCents])).toEqual([
      [20_000, 2_000, 18_000, 900, 18_900],
      [5_000, 0, 5_000, 250, 5_250],
      [20_000, 2_000, 18_000, 0, 18_000],
    ]);
  });

  it("matches the expected document totals", () => {
    expect(totals).toEqual({
      subtotalCents: 45_000,
      discountCents: 4_000,
      taxCents: 1_150,
      grandTotalCents: 42_150,
    });
  });

  it("keeps subtotal - discount + tax === grand total", () => {
    expect(totals.subtotalCents - totals.discountCents + totals.taxCents).toBe(totals.grandTotalCents);
  });

  it("returns zeroed totals for an empty document", () => {
    expect(calculateDocument([]).totals).toEqual({
      subtotalCents: 0,
      discountCents: 0,
      taxCents: 0,
      grandTotalCents: 0,
    });
  });
});

describe("lineInputSchema", () => {
  const payload = { description: "Widget A", quantity: 2, unitPrice: "100.00" };

  it("normalises decimal input into integer minor units", () => {
    expect(lineInputSchema.parse({ ...payload, discount: { type: "percent", value: 10 }, taxPercent: "5" })).toEqual({
      description: "Widget A",
      quantity: 2,
      unitPriceCents: 10_000,
      discount: { type: "percent", value: 1_000 },
      taxPercent: 500,
    });
  });

  it("defaults a missing discount and tax to none", () => {
    expect(lineInputSchema.parse(payload)).toMatchObject({ discount: null, taxPercent: 0 });
  });

  it("makes percent-and-fixed on one line unrepresentable", () => {
    const both = lineInputSchema.safeParse({
      ...payload,
      discount: { type: "percent", value: 10, fixed: 20 },
    });
    expect(both.success && both.data.discount).toEqual({ type: "percent", value: 1_000 });

    expect(lineInputSchema.safeParse({ ...payload, discount: { type: "both", value: 10 } }).success).toBe(false);
  });

  it("rejects a fixed discount above the line subtotal with a specific message", () => {
    const result = lineInputSchema.safeParse({ ...payload, discount: { type: "fixed", value: "200.01" } });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      path: ["discount", "value"],
      message: "Fixed discount must not exceed the line subtotal",
    });
  });

  it("rejects bad quantities, prices and percents", () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ quantity: 0 }, "Quantity must be at least 1"],
      [{ quantity: -3 }, "Quantity must be at least 1"],
      [{ quantity: 1.5 }, "Quantity must be a whole number"],
      [{ unitPrice: "-1" }, "Unit price must be 0 or greater"],
      [{ unitPrice: "abc" }, "Unit price must be a number with at most 2 decimal places, up to 10000000000"],
      [{ taxPercent: "101" }, "Tax percent must be between 0 and 100"],
      [{ description: "  " }, "Description is required"],
    ];

    for (const [override, message] of cases) {
      const result = lineInputSchema.safeParse({ ...payload, ...override });
      expect(result.success, `expected ${JSON.stringify(override)} to fail`).toBe(false);
      expect(result.error?.issues.map((i) => i.message)).toContain(message);
    }
  });
});

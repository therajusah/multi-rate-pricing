import { percentOf } from "./money";

export type Discount =
  | { type: "percent"; value: number }
  | { type: "fixed"; value: number }
  | null;

export interface LineInput {
  quantity: number;
  unitPriceCents: number;
  discount: Discount;
  taxPercent: number;
}

export interface LineTotals {
  subtotalCents: number;
  discountCents: number;
  afterDiscountCents: number;
  taxCents: number;
  totalCents: number;
}

export interface DocumentTotals {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  grandTotalCents: number;
}

export function calculateLine(line: LineInput): LineTotals {
  const subtotalCents = line.quantity * line.unitPriceCents;

  const discountCents =
    line.discount === null
      ? 0
      : line.discount.type === "percent"
        ? percentOf(subtotalCents, line.discount.value)
        : line.discount.value;

  if (discountCents > subtotalCents) {
    throw new RangeError(
      `Discount (${discountCents}) exceeds line subtotal (${subtotalCents})`,
    );
  }

  const afterDiscountCents = subtotalCents - discountCents;
  const taxCents = percentOf(afterDiscountCents, line.taxPercent);

  return {
    subtotalCents,
    discountCents,
    afterDiscountCents,
    taxCents,
    totalCents: afterDiscountCents + taxCents,
  };
}

export function calculateDocument(lines: readonly LineInput[]): {
  lines: LineTotals[];
  totals: DocumentTotals;
} {
  const lineTotals = lines.map(calculateLine);

  const totals = lineTotals.reduce<DocumentTotals>(
    (acc, line) => ({
      subtotalCents: acc.subtotalCents + line.subtotalCents,
      discountCents: acc.discountCents + line.discountCents,
      taxCents: acc.taxCents + line.taxCents,
      grandTotalCents: acc.grandTotalCents + line.totalCents,
    }),
    { subtotalCents: 0, discountCents: 0, taxCents: 0, grandTotalCents: 0 },
  );

  return { lines: lineTotals, totals };
}

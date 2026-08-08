export const MAX_SCALED = 1_000_000_000_000;

export const PERCENT_SCALE = 10_000n;

const DECIMAL_2 = /^-?\d+(\.\d{1,2})?$/;

export function parseScaled2(input: unknown): number | null {
  const text =
    typeof input === "string"
      ? input.trim()
      : typeof input === "number" && Number.isFinite(input)
        ? String(input)
        : null;

  if (text === null || !DECIMAL_2.test(text)) return null;

  const negative = text.startsWith("-");
  const [whole, fraction = ""] = (negative ? text.slice(1) : text).split(".");
  const scaled = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));

  if (!Number.isSafeInteger(scaled) || scaled > MAX_SCALED) return null;
  return negative ? -scaled : scaled;
}

export function formatScaled2(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function mulDivRoundHalfUp(a: bigint, b: bigint, d: bigint): bigint {
  const product = a * b;
  return (product * 2n + (product < 0n ? -d : d)) / (2n * d);
}

export function percentOf(amountCents: number, percentHundredths: number): number {
  return Number(
    mulDivRoundHalfUp(BigInt(amountCents), BigInt(percentHundredths), PERCENT_SCALE),
  );
}

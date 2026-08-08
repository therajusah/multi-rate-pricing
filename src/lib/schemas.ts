import { z } from "zod";
import { MAX_SCALED, parseScaled2 } from "./money";

function scaled2(label: string) {
  return z
    .union([z.string(), z.number()], {
      error: `${label} must be a number`,
    })
    .refine((value) => parseScaled2(value) !== null, {
      error: `${label} must be a number with at most 2 decimal places, up to ${MAX_SCALED / 100}`,
    })
    .transform((value) => parseScaled2(value) as number);
}

function money(label: string) {
  return scaled2(label).refine((cents) => cents >= 0, {
    error: `${label} must be 0 or greater`,
  });
}

function percent(label: string) {
  return scaled2(label).refine((hundredths) => hundredths >= 0 && hundredths <= 10_000, {
    error: `${label} must be between 0 and 100`,
  });
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Date must be in YYYY-MM-DD format" })
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), {
    error: "Date is not a valid calendar date",
  })
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

const text = (label: string, max = 200) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, { error: `${label} is required` })
    .max(max, { error: `${label} must be at most ${max} characters` });

export const lineInputSchema = z
  .object({
    description: text("Description"),
    quantity: z
      .number({ error: "Quantity must be a number" })
      .int({ error: "Quantity must be a whole number" })
      .min(1, { error: "Quantity must be at least 1" })
      .max(1_000_000, { error: "Quantity must be at most 1000000" }),
    unitPrice: money("Unit price"),
    discount: z
      .discriminatedUnion("type", [
        z.object({ type: z.literal("percent"), value: percent("Discount percent") }),
        z.object({ type: z.literal("fixed"), value: money("Discount amount") }),
      ])
      .nullish()
      .transform((value) => value ?? null),
    taxPercent: percent("Tax percent")
      .nullish()
      .transform((value) => value ?? 0),
  })
  .refine(
    (line) =>
      line.discount?.type !== "fixed" ||
      line.discount.value <= line.quantity * line.unitPrice,
    {
      error: "Fixed discount must not exceed the line subtotal",
      path: ["discount", "value"],
    },
  )
  .transform(({ unitPrice, ...rest }) => ({ ...rest, unitPriceCents: unitPrice }));

export type LineInputPayload = z.infer<typeof lineInputSchema>;

export const createDocumentSchema = z.object({
  title: text("Title"),
  customer: text("Customer"),
  issueDate: isoDate,
  lines: z
    .array(lineInputSchema)
    .max(500, { error: "A document may have at most 500 lines" })
    .optional()
    .transform((value) => value ?? []),
});

export const updateDocumentSchema = z
  .object({
    title: text("Title").optional(),
    customer: text("Customer").optional(),
    issueDate: isoDate.optional(),
    lines: z
      .array(lineInputSchema)
      .max(500, { error: "A document may have at most 500 lines" })
      .optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    error: "Provide at least one field to update",
  });

export const reportQuerySchema = z
  .object({
    from: isoDate,
    to: isoDate,
    status: z.enum(["draft", "finalized"]).optional(),
  })
  .refine((query) => query.from <= query.to, {
    error: "`from` must be on or before `to`",
    path: ["from"],
  });

export const credentialsSchema = z.object({
  email: z
    .string({ error: "Email is required" })
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "Enter a valid email address" })),
  password: z
    .string({ error: "Password is required" })
    .min(8, { error: "Password must be at least 8 characters" })
    .max(200, { error: "Password must be at most 200 characters" }),
});

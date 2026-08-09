import type { DocumentJson } from "@/lib/documents";
import { formatScaled2 } from "@/lib/money";
import { StatusBadge } from "./StatusBadge";

export const formatPercent = (hundredths: number) =>
  `${formatScaled2(hundredths).replace(/\.?0+$/, "")}%`;

function describeDiscount(discount: DocumentJson["lines"][number]["discount"]) {
  if (!discount) return "—";
  return discount.type === "percent"
    ? formatPercent(discount.value)
    : formatScaled2(discount.value);
}

export function DocumentView({
  document: doc,
  showMeta = true,
}: {
  document: DocumentJson;
  showMeta?: boolean;
}) {
  return (
    <div className="space-y-6">
      {showMeta && (
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Title" value={doc.title} />
          <Field label="Customer" value={doc.customer} />
          <Field label="Issue date" value={doc.issueDate} />
          <div>
            <dt className="label">Status</dt>
            <dd>
              <StatusBadge status={doc.status} />
            </dd>
          </div>
        </dl>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-2xl text-sm">
          <thead className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="py-2 pr-3 font-medium">Description</th>
              <th className="px-3 py-2 text-right font-medium">Qty</th>
              <th className="px-3 py-2 text-right font-medium">
                <span className="print:hidden">Unit price</span>
                <span className="hidden print:inline">Unit</span>
              </th>
              <th className="px-3 py-2 text-right font-medium">
                <span className="print:hidden">Discount</span>
                <span className="hidden print:inline">Disc</span>
              </th>
              <th className="px-3 py-2 text-right font-medium">
                <span className="print:hidden">Discount amt</span>
                <span className="hidden print:inline">Disc amt</span>
              </th>
              <th className="px-3 py-2 text-right font-medium">Tax</th>
              <th className="px-3 py-2 text-right font-medium">Tax amt</th>
              <th className="py-2 pl-3 text-right font-medium">
                <span className="print:hidden">Line total</span>
                <span className="hidden print:inline">Total</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {doc.lines.map((line) => (
              <tr key={line.id}>
                <td className="py-2.5 pr-3">{line.description}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{line.quantity}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatScaled2(line.unitPriceCents)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-zinc-500">
                  {describeDiscount(line.discount)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatScaled2(line.totals.discountCents)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-zinc-500">
                  {line.taxPercent ? formatPercent(line.taxPercent) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatScaled2(line.totals.taxCents)}
                </td>
                <td className="py-2.5 pl-3 text-right font-medium tabular-nums">
                  {formatScaled2(line.totals.totalCents)}
                </td>
              </tr>
            ))}
            {doc.lines.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-zinc-500">
                  No line items.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <TotalsSummary totals={doc.totals} />
    </div>
  );
}

export function TotalsSummary({
  totals,
  heading,
}: {
  totals: DocumentJson["totals"];
  heading?: string;
}) {
  const rows = [
    ["Subtotal", totals.subtotalCents],
    ["Total discount", totals.discountCents],
    ["Total tax", totals.taxCents],
  ] as const;

  return (
    <div className="flex justify-end">
      <dl className="w-full max-w-xs space-y-1.5 text-sm">
        {heading && <p className="label">{heading}</p>}
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between">
            <dt className="text-zinc-500">{label}</dt>
            <dd className="tabular-nums">{formatScaled2(value)}</dd>
          </div>
        ))}
        <div className="flex justify-between border-t border-zinc-200 pt-1.5 text-base font-semibold">
          <dt>Grand total</dt>
          <dd className="tabular-nums">{formatScaled2(totals.grandTotalCents)}</dd>
        </div>
      </dl>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

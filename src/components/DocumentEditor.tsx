"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { calculateDocument, type LineInput } from "@/lib/calc";
import { ApiClientError, documentApi } from "@/lib/client";
import type { DocumentJson } from "@/lib/documents";
import { parseScaled2 } from "@/lib/money";
import { ErrorBox } from "./ErrorBox";
import { TotalsSummary } from "./DocumentView";

type DiscountKind = "none" | "percent" | "fixed";

interface Row {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountKind: DiscountKind;
  discountValue: string;
  taxPercent: string;
}

const emptyRow = (): Row => ({
  key: crypto.randomUUID(),
  description: "",
  quantity: "1",
  unitPrice: "",
  discountKind: "none",
  discountValue: "",
  taxPercent: "",
});

function toRow(line: DocumentJson["lines"][number]): Row {
  const scaled = (value: number) => (value / 100).toFixed(2);
  return {
    key: line.id,
    description: line.description,
    quantity: String(line.quantity),
    unitPrice: scaled(line.unitPriceCents),
    discountKind: line.discount?.type ?? "none",
    discountValue: line.discount ? scaled(line.discount.value) : "",
    taxPercent: line.taxPercent ? scaled(line.taxPercent) : "",
  };
}

function toPayload(row: Row) {
  return {
    description: row.description,
    quantity: Number(row.quantity),
    unitPrice: row.unitPrice,
    discount:
      row.discountKind === "none"
        ? null
        : { type: row.discountKind, value: row.discountValue },
    taxPercent: row.taxPercent === "" ? 0 : row.taxPercent,
  };
}

function toCalcInput(row: Row): LineInput {
  const quantity = Number(row.quantity);
  const unitPriceCents = parseScaled2(row.unitPrice);
  const discountValue = parseScaled2(row.discountValue);
  const taxPercent = row.taxPercent === "" ? 0 : parseScaled2(row.taxPercent);

  if (!Number.isInteger(quantity) || quantity < 1) throw new Error("invalid quantity");
  if (unitPriceCents === null || unitPriceCents < 0) throw new Error("invalid unit price");
  if (taxPercent === null || taxPercent < 0 || taxPercent > 10_000) throw new Error("invalid tax");
  if (row.discountKind !== "none" && (discountValue === null || discountValue < 0)) {
    throw new Error("invalid discount");
  }

  return {
    quantity,
    unitPriceCents,
    discount:
      row.discountKind === "none"
        ? null
        : { type: row.discountKind, value: discountValue as number },
    taxPercent,
  };
}

export function DocumentEditor({ document: initial }: { document?: DocumentJson }) {
  const router = useRouter();
  const [saved, setSaved] = useState<DocumentJson | undefined>(initial);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [customer, setCustomer] = useState(initial?.customer ?? "");
  const [issueDate, setIssueDate] = useState(
    initial?.issueDate ?? new Date().toISOString().slice(0, 10),
  );
  const [rows, setRows] = useState<Row[]>(initial ? initial.lines.map(toRow) : [emptyRow()]);
  const [dirty, setDirty] = useState(!initial);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const preview = useMemo(() => {
    try {
      return calculateDocument(rows.map(toCalcInput));
    } catch {
      return null;
    }
  }, [rows]);

  function edit(key: string, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    setDirty(true);
  }

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught as ApiClientError);
    } finally {
      setBusy(null);
    }
  }

  async function persist(): Promise<DocumentJson> {
    const body = { title, customer, issueDate, lines: rows.map(toPayload) };

    const { document: result } = saved
      ? await documentApi.update(saved.id, body)
      : await documentApi.create(body);

    setSaved(result);
    setRows(result.lines.map(toRow));
    setDirty(false);
    return result;
  }

  const isNew = !saved;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {isNew ? "New document" : title || "Untitled"}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Draft — totals are recalculated and stored by the server on every save.
          </p>
        </div>
        <Link href="/documents" className="btn btn-secondary">
          Back
        </Link>
      </div>

      <ErrorBox error={error} />

      <section className="card space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="title">
              Title
            </label>
            <input
              id="title"
              className="field"
              value={title}
              placeholder="Q3 proposal"
              onChange={(event) => {
                setTitle(event.target.value);
                setDirty(true);
              }}
            />
          </div>
          <div>
            <label className="label" htmlFor="customer">
              Customer
            </label>
            <input
              id="customer"
              className="field"
              value={customer}
              placeholder="Acme Inc."
              onChange={(event) => {
                setCustomer(event.target.value);
                setDirty(true);
              }}
            />
          </div>
          <div>
            <label className="label" htmlFor="issueDate">
              Issue date
            </label>
            <input
              id="issueDate"
              type="date"
              className="field"
              value={issueDate}
              onChange={(event) => {
                setIssueDate(event.target.value);
                setDirty(true);
              }}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-3xl text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="pb-2 pr-3 font-medium">Description</th>
                <th className="px-3 pb-2 font-medium">Qty</th>
                <th className="px-3 pb-2 font-medium">Unit price</th>
                <th className="px-3 pb-2 font-medium">Discount</th>
                <th className="px-3 pb-2 font-medium">Tax %</th>
                <th className="pb-2 pl-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="align-top">
                  <td className="py-1.5 pr-3">
                    <input
                      className="field"
                      aria-label="Description"
                      value={row.description}
                      placeholder="Widget A"
                      onChange={(event) => edit(row.key, { description: event.target.value })}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className="field w-20"
                      aria-label="Quantity"
                      inputMode="numeric"
                      value={row.quantity}
                      onChange={(event) => edit(row.key, { quantity: event.target.value })}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className="field w-28"
                      aria-label="Unit price"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={row.unitPrice}
                      onChange={(event) => edit(row.key, { unitPrice: event.target.value })}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex gap-1.5">
                      <select
                        className="field w-28"
                        aria-label="Discount type"
                        value={row.discountKind}
                        onChange={(event) =>
                          edit(row.key, {
                            discountKind: event.target.value as DiscountKind,
                            discountValue: "",
                          })
                        }
                      >
                        <option value="none">None</option>
                        <option value="percent">Percent</option>
                        <option value="fixed">Fixed</option>
                      </select>
                      <input
                        className="field w-24"
                        aria-label="Discount value"
                        inputMode="decimal"
                        placeholder={row.discountKind === "percent" ? "10" : "20.00"}
                        disabled={row.discountKind === "none"}
                        value={row.discountValue}
                        onChange={(event) => edit(row.key, { discountValue: event.target.value })}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className="field w-20"
                      aria-label="Tax percent"
                      inputMode="decimal"
                      placeholder="0"
                      value={row.taxPercent}
                      onChange={(event) => edit(row.key, { taxPercent: event.target.value })}
                    />
                  </td>
                  <td className="py-1.5 pl-3">
                    <button
                      type="button"
                      className="btn btn-secondary px-2 py-2"
                      aria-label="Remove line"
                      onClick={() => {
                        setRows((current) => current.filter((item) => item.key !== row.key));
                        setDirty(true);
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setRows((current) => [...current, emptyRow()]);
            setDirty(true);
          }}
        >
          Add line
        </button>

        {preview || saved ? (
          <TotalsSummary
            totals={dirty ? (preview?.totals ?? saved!.totals) : saved!.totals}
            heading={
              dirty
                ? "Preview — the server recalculates on save"
                : "Totals as stored by the server"
            }
          />
        ) : (
          <p className="text-right text-sm text-zinc-500">
            Fill in valid quantities and prices to preview totals.
          </p>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy !== null}
          onClick={() =>
            run("save", async () => {
              const result = await persist();
              if (isNew) router.replace(`/documents/${result.id}`);
              router.refresh();
            })
          }
        >
          {busy === "save" ? "Saving…" : isNew ? "Create document" : "Save changes"}
        </button>

        {saved && (
          <>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy !== null}
              onClick={() =>
                run("finalize", async () => {
                  const result = await persist();
                  await documentApi.finalize(result.id);
                  router.refresh();
                })
              }
            >
              {busy === "finalize" ? "Finalizing…" : "Save & finalize"}
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy !== null}
              onClick={() =>
                run("duplicate", async () => {
                  const { document: copy } = await documentApi.duplicate(saved.id);
                  router.push(`/documents/${copy.id}`);
                })
              }
            >
              Duplicate
            </button>

            <button
              type="button"
              className="btn btn-danger ml-auto"
              disabled={busy !== null}
              onClick={() =>
                run("delete", async () => {
                  await documentApi.remove(saved.id);
                  router.replace("/documents");
                  router.refresh();
                })
              }
            >
              {busy === "delete" ? "Deleting…" : "Delete"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

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
type FieldKey = "description" | "quantity" | "unitPrice" | "discountValue" | "taxPercent";
type RowErrors = Partial<Record<FieldKey, string>>;

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

function stripLeadingMinus(value: string) {
  return value.replace(/^-+/, "");
}

function fieldError(row: Row, field: FieldKey): string | undefined {
  switch (field) {
    case "description":
      return row.description.trim() ? undefined : "Description is required";
    case "quantity": {
      if (row.quantity.trim() === "") return "Quantity must be at least 1";
      const quantity = Number(row.quantity);
      if (!Number.isFinite(quantity)) return "Quantity must be a number";
      if (!Number.isInteger(quantity)) return "Quantity must be a whole number";
      if (quantity < 1) return "Quantity must be at least 1";
      return undefined;
    }
    case "unitPrice": {
      if (row.unitPrice.trim() === "") return "Unit price is required";
      const cents = parseScaled2(row.unitPrice);
      if (cents === null) {
        return "Unit price must be a number with at most 2 decimal places";
      }
      if (cents < 0) return "Unit price must be 0 or greater";
      return undefined;
    }
    case "discountValue": {
      if (row.discountKind === "none" || row.discountValue.trim() === "") return undefined;
      const label = row.discountKind === "percent" ? "Discount percent" : "Discount amount";
      const value = parseScaled2(row.discountValue);
      if (value === null) {
        return `${label} must be a number with at most 2 decimal places`;
      }
      if (value < 0) return `${label} must be 0 or greater`;
      if (row.discountKind === "percent" && value > 10_000) {
        return "Discount percent must be between 0 and 100";
      }
      return undefined;
    }
    case "taxPercent": {
      if (row.taxPercent.trim() === "") return undefined;
      const value = parseScaled2(row.taxPercent);
      if (value === null) {
        return "Tax percent must be a number with at most 2 decimal places";
      }
      if (value < 0 || value > 10_000) return "Tax percent must be between 0 and 100";
      return undefined;
    }
  }
}

function validateRow(row: Row): RowErrors {
  const errors: RowErrors = {};
  for (const field of [
    "description",
    "quantity",
    "unitPrice",
    "discountValue",
    "taxPercent",
  ] as FieldKey[]) {
    const message = fieldError(row, field);
    if (message) errors[field] = message;
  }
  return errors;
}

function FieldMessage({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-600">{message}</p>;
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
  const [errors, setErrors] = useState<Record<string, RowErrors>>({});
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
    setRows((current) =>
      current.map((row) => {
        if (row.key !== key) return row;
        const updated = { ...row, ...patch };
        setErrors((errs) => {
          const existing = errs[key];
          if (!existing) return errs;
          const nextErrors = { ...existing };
          for (const field of Object.keys(existing) as FieldKey[]) {
            const message = fieldError(updated, field);
            if (message) nextErrors[field] = message;
            else delete nextErrors[field];
          }
          return { ...errs, [key]: nextErrors };
        });
        return updated;
      }),
    );
    setDirty(true);
  }

  function blur(key: string, field: FieldKey) {
    const row = rows.find((item) => item.key === key);
    if (!row) return;
    const message = fieldError(row, field);
    setErrors((current) => {
      const next = { ...(current[key] ?? {}) };
      if (message) next[field] = message;
      else delete next[field];
      return { ...current, [key]: next };
    });
  }

  function validateAll(): boolean {
    const next: Record<string, RowErrors> = {};
    let ok = true;
    for (const row of rows) {
      const rowErrors = validateRow(row);
      next[row.key] = rowErrors;
      if (Object.keys(rowErrors).length > 0) ok = false;
    }
    setErrors(next);
    return ok;
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
    setErrors({});
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
                <th className="pb-2 pr-3 font-medium">
                  Description <span className="text-red-600">*</span>
                </th>
                <th className="px-3 pb-2 font-medium">
                  Qty <span className="text-red-600">*</span>
                </th>
                <th className="px-3 pb-2 font-medium">
                  Unit price <span className="text-red-600">*</span>
                </th>
                <th className="px-3 pb-2 font-medium">Discount</th>
                <th className="px-3 pb-2 font-medium">Tax %</th>
                <th className="pb-2 pl-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const rowErrors = errors[row.key] ?? {};
                return (
                  <tr key={row.key} className="align-top">
                    <td className="py-1.5 pr-3">
                      <input
                        className="field"
                        aria-label="Description"
                        aria-invalid={Boolean(rowErrors.description)}
                        value={row.description}
                        placeholder="Widget A"
                        onChange={(event) => edit(row.key, { description: event.target.value })}
                        onBlur={() => blur(row.key, "description")}
                      />
                      <FieldMessage message={rowErrors.description} />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        className="field w-20"
                        aria-label="Quantity"
                        aria-invalid={Boolean(rowErrors.quantity)}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        step={1}
                        value={row.quantity}
                        onChange={(event) => {
                          const value = stripLeadingMinus(event.target.value);
                          if (value === "" || /^\d+$/.test(value)) {
                            edit(row.key, { quantity: value });
                          }
                        }}
                        onBlur={() => blur(row.key, "quantity")}
                      />
                      <FieldMessage message={rowErrors.quantity} />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        className="field w-28"
                        aria-label="Unit price"
                        aria-invalid={Boolean(rowErrors.unitPrice)}
                        inputMode="decimal"
                        min={0}
                        placeholder="0.00"
                        value={row.unitPrice}
                        onChange={(event) =>
                          edit(row.key, { unitPrice: stripLeadingMinus(event.target.value) })
                        }
                        onBlur={() => blur(row.key, "unitPrice")}
                      />
                      <FieldMessage message={rowErrors.unitPrice} />
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
                          aria-invalid={Boolean(rowErrors.discountValue)}
                          inputMode="decimal"
                          min={0}
                          placeholder={row.discountKind === "percent" ? "10" : "20.00"}
                          disabled={row.discountKind === "none"}
                          value={row.discountValue}
                          onChange={(event) =>
                            edit(row.key, {
                              discountValue: stripLeadingMinus(event.target.value),
                            })
                          }
                          onBlur={() => blur(row.key, "discountValue")}
                        />
                      </div>
                      <FieldMessage message={rowErrors.discountValue} />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        className="field w-20"
                        aria-label="Tax percent"
                        aria-invalid={Boolean(rowErrors.taxPercent)}
                        inputMode="decimal"
                        min={0}
                        max={100}
                        placeholder="0"
                        value={row.taxPercent}
                        onChange={(event) =>
                          edit(row.key, { taxPercent: stripLeadingMinus(event.target.value) })
                        }
                        onBlur={() => blur(row.key, "taxPercent")}
                      />
                      <FieldMessage message={rowErrors.taxPercent} />
                    </td>
                    <td className="py-1.5 pl-3">
                      <button
                        type="button"
                        className="btn btn-secondary px-2 py-2"
                        aria-label="Remove line"
                        onClick={() => {
                          setRows((current) => current.filter((item) => item.key !== row.key));
                          setErrors((current) => {
                            const next = { ...current };
                            delete next[row.key];
                            return next;
                          });
                          setDirty(true);
                        }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
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
              if (!validateAll()) return;
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
                  if (!validateAll()) return;
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

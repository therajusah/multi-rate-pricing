"use client";

import { useState } from "react";
import { ApiClientError, documentApi } from "@/lib/client";
import type { Summary } from "@/lib/documents";
import { formatScaled2 } from "@/lib/money";
import { ErrorBox } from "./ErrorBox";

export function ReportPanel({ initial }: { initial: Summary }) {
  const [summary, setSummary] = useState(initial);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [pending, setPending] = useState(false);

  async function run(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      setSummary((await documentApi.summary(from, to)).summary);
    } catch (caught) {
      setError(caught as ApiClientError);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="card p-5">
      <form onSubmit={run} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="from">
            From (issue date)
          </label>
          <input
            id="from"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="field w-44"
          />
        </div>
        <div>
          <label className="label" htmlFor="to">
            To (issue date)
          </label>
          <input
            id="to"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="field w-44"
          />
        </div>
        <button type="submit" className="btn btn-secondary" disabled={pending}>
          {pending ? "Loading…" : "Run report"}
        </button>
      </form>

      <div className="mt-4">
        <ErrorBox error={error} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Documents" value={String(summary.documentCount)} />
        <Stat label="Total discount" value={formatScaled2(summary.totals.discountCents)} />
        <Stat label="Total tax" value={formatScaled2(summary.totals.taxCents)} />
        <Stat label="Sum of grand totals" value={formatScaled2(summary.totals.grandTotalCents)} />
      </dl>

      <p className="mt-3 text-xs text-zinc-500">
        Covers {summary.from} to {summary.to} inclusive, drafts and finalized documents.
      </p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-2.5">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

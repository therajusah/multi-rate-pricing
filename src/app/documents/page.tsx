import Link from "next/link";
import { redirect } from "next/navigation";
import { ReportPanel } from "@/components/ReportPanel";
import { StatusBadge } from "@/components/StatusBadge";
import { getUserId } from "@/lib/auth";
import { listDocuments, serializeDocument, summarize, toDateOnly } from "@/lib/documents";
import { formatScaled2 } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const userId = await getUserId();
  if (!userId) redirect("/login");

  const documents = (await listDocuments(userId)).map(serializeDocument);

  const dates = documents.map((doc) => doc.issueDate).sort();
  const today = toDateOnly(new Date());
  const from = dates[0] ?? today;
  const to = dates[dates.length - 1] ?? today;

  const summary = await summarize(userId, {
    from: new Date(`${from}T00:00:00.000Z`),
    to: new Date(`${to}T00:00:00.000Z`),
  });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Documents</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {documents.length} document{documents.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link href="/documents/new" className="btn btn-primary">
          New document
        </Link>
      </div>

      <ReportPanel initial={summary} />

      <div className="card overflow-hidden">
        {documents.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-zinc-500">
            No documents yet. Create your first one to see totals here.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-5 py-3 font-medium">Title</th>
                <th className="px-5 py-3 font-medium">Customer</th>
                <th className="px-5 py-3 font-medium">Issue date</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Grand total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-zinc-50">
                  <td className="px-5 py-3">
                    <Link href={`/documents/${doc.id}`} className="font-medium underline-offset-4 hover:underline">
                      {doc.title}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-zinc-600">{doc.customer}</td>
                  <td className="px-5 py-3 tabular-nums text-zinc-600">{doc.issueDate}</td>
                  <td className="px-5 py-3">
                    <StatusBadge status={doc.status} />
                  </td>
                  <td className="px-5 py-3 text-right font-medium tabular-nums">
                    {formatScaled2(doc.totals.grandTotalCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

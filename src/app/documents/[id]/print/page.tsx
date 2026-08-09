import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ApiError } from "@/lib/errors";
import { DocumentView } from "@/components/DocumentView";
import { PrintButton } from "@/components/PrintButton";
import { getUserId } from "@/lib/auth";
import { getDocument, serializeDocument, toObjectId } from "@/lib/documents";

export const dynamic = "force-dynamic";

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) redirect("/login");

  const { id } = await params;
  let document;
  try {
    document = serializeDocument(await getDocument(userId, toObjectId(id)));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      <div className="no-print flex items-center justify-between gap-3">
        <Link href={`/documents/${document.id}`} className="btn btn-secondary">
          Back to document
        </Link>
        <PrintButton />
      </div>

      <article className="card p-8 print:border-0 print:p-0 print:shadow-none">
        <header className="mb-6 flex items-start justify-between print:mb-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight print:text-xl">
              {document.title}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">Prepared for {document.customer}</p>
          </div>
          <p className="text-sm text-zinc-500">Issued {document.issueDate}</p>
        </header>

        <DocumentView document={document} showMeta={false} compactHeaders />

        <footer className="mt-8 border-t border-zinc-200 pt-4 text-xs text-zinc-500">
          All amounts are rounded to 2 decimal places per line; tax is applied to the discounted
          line amount.
        </footer>
      </article>
    </div>
  );
}

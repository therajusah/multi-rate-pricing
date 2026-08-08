import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ApiError } from "@/lib/errors";
import { DocumentEditor } from "@/components/DocumentEditor";
import { DocumentView } from "@/components/DocumentView";
import { DuplicateButton } from "@/components/DuplicateButton";
import { getUserId } from "@/lib/auth";
import { getDocument, serializeDocument, toObjectId } from "@/lib/documents";

export const dynamic = "force-dynamic";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
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

  if (document.status === "draft") {
    return <DocumentEditor document={document} />;
  }

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{document.title}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Finalized on {new Date(document.finalizedAt ?? Date.now()).toLocaleString()} — read-only.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/documents" className="btn btn-secondary">
            Back
          </Link>
          <Link href={`/documents/${document.id}/print`} className="btn btn-secondary">
            Print view
          </Link>
          <DuplicateButton id={document.id} />
        </div>
      </div>

      <section className="card p-5">
        <DocumentView document={document} />
      </section>
    </div>
  );
}

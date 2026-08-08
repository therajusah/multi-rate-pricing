import { NextResponse } from "next/server";
import { parseBody, withErrors } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { createDocument, listDocuments, serializeDocument } from "@/lib/documents";
import { createDocumentSchema } from "@/lib/schemas";

export const GET = withErrors(async () => {
  const userId = await requireUserId();
  const docs = await listDocuments(userId);
  return NextResponse.json({ documents: docs.map(serializeDocument) });
});

export const POST = withErrors(async (request: Request) => {
  const userId = await requireUserId();
  const input = await parseBody(request, createDocumentSchema);
  const doc = await createDocument(userId, input);
  return NextResponse.json({ document: serializeDocument(doc) }, { status: 201 });
});

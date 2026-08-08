import { NextResponse } from "next/server";
import { parseBody, withErrors } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import {
  deleteDocument,
  getDocument,
  serializeDocument,
  toObjectId,
  updateDocument,
} from "@/lib/documents";
import { updateDocumentSchema } from "@/lib/schemas";

type Context = { params: Promise<{ id: string }> };

export const GET = withErrors(async (_request: Request, { params }: Context) => {
  const userId = await requireUserId();
  const doc = await getDocument(userId, toObjectId((await params).id));
  return NextResponse.json({ document: serializeDocument(doc) });
});

export const PATCH = withErrors(async (request: Request, { params }: Context) => {
  const userId = await requireUserId();
  const changes = await parseBody(request, updateDocumentSchema);
  const doc = await updateDocument(userId, toObjectId((await params).id), changes);
  return NextResponse.json({ document: serializeDocument(doc) });
});

export const DELETE = withErrors(async (_request: Request, { params }: Context) => {
  const userId = await requireUserId();
  await deleteDocument(userId, toObjectId((await params).id));
  return NextResponse.json({ ok: true });
});

import { NextResponse } from "next/server";
import { parseBody, withErrors } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { removeLine, serializeDocument, toObjectId, updateLine } from "@/lib/documents";
import { lineInputSchema } from "@/lib/schemas";

type Context = { params: Promise<{ id: string; lineId: string }> };

export const PATCH = withErrors(async (request: Request, { params }: Context) => {
  const userId = await requireUserId();
  const { id, lineId } = await params;
  const line = await parseBody(request, lineInputSchema);
  const doc = await updateLine(userId, toObjectId(id), toObjectId(lineId), line);
  return NextResponse.json({ document: serializeDocument(doc) });
});

export const DELETE = withErrors(async (_request: Request, { params }: Context) => {
  const userId = await requireUserId();
  const { id, lineId } = await params;
  const doc = await removeLine(userId, toObjectId(id), toObjectId(lineId));
  return NextResponse.json({ document: serializeDocument(doc) });
});

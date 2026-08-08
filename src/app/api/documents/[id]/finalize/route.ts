import { NextResponse } from "next/server";
import { withErrors } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { finalizeDocument, serializeDocument, toObjectId } from "@/lib/documents";

type Context = { params: Promise<{ id: string }> };

export const POST = withErrors(async (_request: Request, { params }: Context) => {
  const userId = await requireUserId();
  const doc = await finalizeDocument(userId, toObjectId((await params).id));
  return NextResponse.json({ document: serializeDocument(doc) });
});

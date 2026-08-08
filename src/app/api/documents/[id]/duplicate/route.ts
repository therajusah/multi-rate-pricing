import { NextResponse } from "next/server";
import { withErrors } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { duplicateDocument, serializeDocument, toObjectId } from "@/lib/documents";

type Context = { params: Promise<{ id: string }> };

export const POST = withErrors(async (_request: Request, { params }: Context) => {
  const userId = await requireUserId();
  const doc = await duplicateDocument(userId, toObjectId((await params).id));
  return NextResponse.json({ document: serializeDocument(doc) }, { status: 201 });
});

import { NextResponse } from "next/server";
import { parseBody, withErrors } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { addLine, serializeDocument, toObjectId } from "@/lib/documents";
import { lineInputSchema } from "@/lib/schemas";

type Context = { params: Promise<{ id: string }> };

export const POST = withErrors(async (request: Request, { params }: Context) => {
  const userId = await requireUserId();
  const line = await parseBody(request, lineInputSchema);
  const doc = await addLine(userId, toObjectId((await params).id), line);
  return NextResponse.json({ document: serializeDocument(doc) }, { status: 201 });
});

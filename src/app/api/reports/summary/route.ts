import { NextResponse } from "next/server";
import { parseQuery, withErrors } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { summarize } from "@/lib/documents";
import { reportQuerySchema } from "@/lib/schemas";

export const GET = withErrors(async (request: Request) => {
  const userId = await requireUserId();
  const range = parseQuery(new URL(request.url), reportQuerySchema);
  return NextResponse.json({ summary: await summarize(userId, range) });
});

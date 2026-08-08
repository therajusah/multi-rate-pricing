import { NextResponse } from "next/server";
import { withErrors } from "@/lib/api";
import { endSession } from "@/lib/auth";

export const POST = withErrors(async () => {
  await endSession();
  return NextResponse.json({ ok: true });
});

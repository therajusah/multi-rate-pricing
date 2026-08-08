import { NextResponse } from "next/server";
import { withErrors } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { users } from "@/lib/db";

export const GET = withErrors(async () => {
  const userId = await requireUserId();
  const user = await (await users()).findOne({ _id: userId }, { projection: { passwordHash: 0 } });

  return NextResponse.json({
    user: user ? { id: user._id.toHexString(), email: user.email } : null,
  });
});

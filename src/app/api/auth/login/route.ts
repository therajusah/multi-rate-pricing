import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { parseBody, withErrors } from "@/lib/api";
import { startSession } from "@/lib/auth";
import { ApiError } from "@/lib/errors";
import { hashPassword, verifyPassword } from "@/lib/password";
import { users } from "@/lib/db";
import { credentialsSchema } from "@/lib/schemas";

let decoyHash: Promise<string> | undefined;
const decoy = () => (decoyHash ??= hashPassword(randomBytes(24).toString("hex")));

export const POST = withErrors(async (request: Request) => {
  const { email, password } = await parseBody(request, credentialsSchema);

  const user = await (await users()).findOne({ email });
  const valid = await verifyPassword(password, user?.passwordHash ?? (await decoy()));

  if (!user || !valid) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Incorrect email or password");
  }

  await startSession(user._id.toHexString());
  return NextResponse.json({ user: { id: user._id.toHexString(), email: user.email } });
});

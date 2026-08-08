import { NextResponse } from "next/server";
import { MongoServerError, ObjectId } from "mongodb";
import { parseBody, withErrors } from "@/lib/api";
import { startSession } from "@/lib/auth";
import { ApiError } from "@/lib/errors";
import { hashPassword } from "@/lib/password";
import { users } from "@/lib/db";
import { credentialsSchema } from "@/lib/schemas";

export const POST = withErrors(async (request: Request) => {
  const { email, password } = await parseBody(request, credentialsSchema);

  const user = {
    _id: new ObjectId(),
    email,
    passwordHash: await hashPassword(password),
    createdAt: new Date(),
  };

  try {
    await (await users()).insertOne(user);
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      throw new ApiError(409, "EMAIL_TAKEN", "An account with this email already exists");
    }
    throw error;
  }

  await startSession(user._id.toHexString());
  return NextResponse.json({ user: { id: user._id.toHexString(), email } }, { status: 201 });
});

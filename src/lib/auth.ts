import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";
import { ApiError } from "./errors";

const SESSION_COOKIE = "session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function sessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export async function startSession(userId: string): Promise<void> {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(sessionSecret());

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getUserId(): Promise<ObjectId | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, sessionSecret());
    return payload.sub && ObjectId.isValid(payload.sub) ? new ObjectId(payload.sub) : null;
  } catch {
    return null;
  }
}

export async function requireUserId(): Promise<ObjectId> {
  const userId = await getUserId();
  if (!userId) throw new ApiError(401, "UNAUTHORIZED", "You must be signed in");
  return userId;
}

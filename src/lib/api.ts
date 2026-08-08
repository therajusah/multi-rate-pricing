import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { ApiError, type ErrorCode, type ErrorDetail } from "./errors";

function errorResponse(status: number, code: ErrorCode, message: string, details?: ErrorDetail[]) {
  return NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status });
}

export function withErrors<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
) {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ApiError) {
        return errorResponse(error.status, error.code, error.message, error.details);
      }
      if (error instanceof ZodError) {
        return errorResponse(422, "VALIDATION_ERROR", "Request validation failed", toDetails(error));
      }
      console.error("Unhandled API error", error);
      return errorResponse(500, "INTERNAL_ERROR", "Something went wrong");
    }
  };
}

function toDetails(error: ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({
    path: issue.path.join(".") || "(body)",
    message: issue.message,
  }));
}

export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(422, "VALIDATION_ERROR", "Request body must be valid JSON");
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ApiError(422, "VALIDATION_ERROR", "Request validation failed", toDetails(result.error));
  }
  return result.data;
}

export function parseQuery<T>(url: URL, schema: ZodType<T>): T {
  const result = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!result.success) {
    throw new ApiError(422, "VALIDATION_ERROR", "Invalid query parameters", toDetails(result.error));
  }
  return result.data;
}

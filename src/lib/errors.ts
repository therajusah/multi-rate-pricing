export type ErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_CREDENTIALS"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "EMAIL_TAKEN"
  | "DOCUMENT_FINALIZED"
  | "INTERNAL_ERROR";

export interface ErrorDetail {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const notFound = () => new ApiError(404, "NOT_FOUND", "Document not found");

export const finalized = () =>
  new ApiError(
    409,
    "DOCUMENT_FINALIZED",
    "This document is finalized and can no longer be modified. Duplicate it to make changes.",
  );

import type { ErrorDetail } from "./errors";
import type { DocumentJson, Summary } from "./documents";

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly details: ErrorDetail[] = [],
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body ? { "content-type": "application/json", ...init?.headers } : init?.headers,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = payload?.error;
    throw new ApiClientError(
      error?.message ?? `Request failed with status ${response.status}`,
      error?.code ?? "UNKNOWN",
      error?.details ?? [],
    );
  }
  return payload as T;
}

export const documentApi = {
  create: (body: unknown) =>
    api<{ document: DocumentJson }>("/api/documents", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: unknown) =>
    api<{ document: DocumentJson }>(`/api/documents/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  remove: (id: string) => api<{ ok: true }>(`/api/documents/${id}`, { method: "DELETE" }),
  finalize: (id: string) =>
    api<{ document: DocumentJson }>(`/api/documents/${id}/finalize`, { method: "POST" }),
  duplicate: (id: string) =>
    api<{ document: DocumentJson }>(`/api/documents/${id}/duplicate`, { method: "POST" }),
  summary: (from: string, to: string) =>
    api<{ summary: Summary }>(`/api/reports/summary?from=${from}&to=${to}`),
};

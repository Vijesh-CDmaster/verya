// Typed API client — the ONLY place the frontend talks to the backend.
// Base URL: Next.js rewrites proxy /api/* to the Fastify backend in dev;
// in production set NEXT_PUBLIC_API_URL to the backend origin directly.

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly issues?: string[]
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const BASE = process.env.NEXT_PUBLIC_API_URL || "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await res.text();
  const body: unknown = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = body as { error?: string; issues?: string[] };
    throw new ApiError(err.error ?? `Request failed (${res.status})`, res.status, err.issues);
  }
  return body as T;
}

export const api = {
  health: () => request<{ ok: boolean; auth: string }>("/health"),

  startPipeline: (payload: { input: string; statedStack: string; policy: string }) =>
    request<{ session: unknown }>("/api/pipeline", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getPipeline: (id: string) => request<{ session: unknown }>(`/api/pipeline/${id}`),

  act: (id: string, action: unknown) =>
    request<{ session: unknown }>(`/api/pipeline/${id}/action`, {
      method: "POST",
      body: JSON.stringify(action),
    }),

  execute: (id: string) =>
    request<{ session: unknown }>(`/api/pipeline/${id}/execute`, { method: "POST" }),

  dashboard: () => request<Record<string, unknown>>("/api/dashboard"),

  verifyLedger: () => request<{ valid: boolean; checked: number }>("/api/ledger/verify"),

  ledgerRecords: (sessionId?: string) =>
    request<{ records: Array<Record<string, unknown>> }>(
      `/api/ledger/records${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`
    ),

  createLead: (lead: { name: string; email: string; phone?: string }) =>
    request<{ ok: boolean; message: string }>("/api/leads", {
      method: "POST",
      body: JSON.stringify(lead),
    }),

  memorySearch: (query: string, category?: string) =>
    request<{ results: Array<Record<string, unknown>> }>(
      `/api/memory/search?q=${encodeURIComponent(query)}${category ? `&category=${encodeURIComponent(category)}` : ""}`
    ),
};

// Token bridge between Clerk (frontend) and the Fastify API (F38).
// AuthBridge stores Clerk's getToken in this module; the API client attaches the
// resulting JWT as a Bearer header so the backend can verify org membership.
let tokenGetter: (() => Promise<string | null>) | null = null;

export function setTokenGetter(fn: (() => Promise<string | null>) | null): void {
  tokenGetter = fn;
}

export async function getAuthToken(): Promise<string | null> {
  if (!tokenGetter) return null;
  try {
    return await tokenGetter();
  } catch {
    return null;
  }
}

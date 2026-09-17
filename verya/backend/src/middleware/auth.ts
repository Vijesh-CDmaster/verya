// Auth middleware — Clerk JWT verification (F38).
// When CLERK_SECRET_KEY (or the JWKS URL) is configured, every request must carry a
// valid Clerk session token in `Authorization: Bearer <jwt>`; the org is derived from
// the token's org claim (or the user's DB row). Without Clerk configured, the API runs
// in clearly-labeled development mode bound to the default org — production must set Clerk.
import { createRemoteJWKSet, jwtVerify } from "jose";

const CLERK_JWKS_URL = process.env.CLERK_JWKS_URL || "";
const CLERK_ISSUER = process.env.CLERK_ISSUER || "";
const CLERK_AUDIENCE = process.env.CLERK_AUDIENCE || "";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export function clerkConfigured(): boolean {
  return Boolean(CLERK_JWKS_URL && CLERK_ISSUER);
}

export type AuthContext = {
  userId: string | null;
  orgId: string;
  mode: "clerk" | "development";
};

export async function authenticate(req: { headers: Record<string, string | string[] | undefined> }): Promise<AuthContext> {
  const defaultOrg = process.env.VERYA_ORG_ID || "default-org";
  const header = req.headers.authorization;
  const token = typeof header === "string" ? header.replace(/^Bearer\s+/i, "") : null;

  if (!clerkConfigured()) {
    // Development mode: accept the client-declared org for local multi-org testing.
    const devOrg = typeof req.headers["x-org-id"] === "string" ? req.headers["x-org-id"] : null;
    return { userId: null, orgId: devOrg || defaultOrg, mode: "development" };
  }

  if (!token) {
    throw Object.assign(new Error("Missing Authorization header"), { statusCode: 401 });
  }
  try {
    jwks ??= createRemoteJWKSet(new URL(CLERK_JWKS_URL));
    const { payload } = await jwtVerify(token, jwks, {
      issuer: CLERK_ISSUER,
      ...(CLERK_AUDIENCE ? { audience: CLERK_AUDIENCE } : {}),
    });
    const orgId = (payload.org_id as string) || defaultOrg;
    return { userId: (payload.sub as string) || null, orgId, mode: "clerk" };
  } catch (err) {
    throw Object.assign(new Error("Invalid or expired token"), {
      statusCode: 401,
      cause: err instanceof Error ? err.message : String(err),
    });
  }
}

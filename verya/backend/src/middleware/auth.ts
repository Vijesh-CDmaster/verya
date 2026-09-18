// Auth middleware — Clerk JWT verification (F38).
// Configuration is derived from the Clerk publishable key (the frontend's
// NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY): its base64 payload encodes the instance
// domain, which yields the JWKS URL and issuer. No CLERK_JWKS_URL/ISSUER/AUDIENCE
// manual setup is needed; CLERK_SECRET_KEY alone also works via its sk_… domain
// segment when the publishable key is not shared. Explicit CLERK_JWKS_URL /
// CLERK_ISSUER / CLERK_AUDIENCE overrides still win when provided.
// Without any Clerk configuration, the API runs in clearly-labeled development
// mode bound to the default org — production must set Clerk.
import { createRemoteJWKSet, jwtVerify } from "jose";

const CLERK_JWKS_URL = process.env.CLERK_JWKS_URL || "";
const CLERK_ISSUER = process.env.CLERK_ISSUER || "";
const CLERK_AUDIENCE = process.env.CLERK_AUDIENCE || "";

/**
 * Derive the Clerk instance domain from a publishable or secret key.
 * Keys look like pk_test_<base64url> where the payload decodes to "<domain>$".
 */
export function clerkDomainFromKey(key: string | undefined): string | null {
  if (!key) return null;
  const m = key.match(/^p[ks]_(?:test|live)_([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  try {
    const decoded = Buffer.from(m[1], "base64url").toString("utf8");
    const domain = decoded.replace(/\$$/, "").trim();
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain) ? domain : null;
  } catch {
    return null;
  }
}

function resolveClerkConfig(): { jwksUrl: string; issuer: string } | null {
  if (CLERK_JWKS_URL && CLERK_ISSUER) return { jwksUrl: CLERK_JWKS_URL, issuer: CLERK_ISSUER };
  const domain =
    clerkDomainFromKey(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) ??
    clerkDomainFromKey(process.env.CLERK_SECRET_KEY);
  if (!domain) return null;
  return {
    jwksUrl: `https://${domain}/.well-known/jwks.json`,
    issuer: `https://${domain}`,
  };
}

const RESOLVED = resolveClerkConfig();

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export function clerkConfigured(): boolean {
  return RESOLVED !== null;
}

export type AuthContext = {
  userId: string | null;
  orgId: string;
  mode: "clerk" | "development" | "anonymous";
  role: string | null;
};

export async function authenticate(
  req: { headers: Record<string, string | string[] | undefined> },
  opts?: { public?: boolean }
): Promise<AuthContext> {
  const defaultOrg = process.env.VERYA_ORG_ID || "default-org";
  const header = req.headers.authorization;
  const token = typeof header === "string" ? header.replace(/^Bearer\s+/i, "") : null;

  // VERYA_DEV_AUTH=1 forces development mode (local testing/E2E) even when Clerk
  // keys are present. Never set it in production.
  if (!clerkConfigured() || process.env.VERYA_DEV_AUTH === "1") {
    // Development mode: accept the client-declared org for local multi-org testing.
    const devOrg = typeof req.headers["x-org-id"] === "string" ? req.headers["x-org-id"] : null;
    return { userId: null, orgId: devOrg || defaultOrg, mode: "development", role: null };
  }

  if (!token) {
    // Public routes (health, lead capture) accept anonymous access under Clerk;
    // everything else requires a valid session token.
    if (opts?.public) {
      return { userId: null, orgId: defaultOrg, mode: "anonymous", role: null };
    }
    throw Object.assign(new Error("Missing Authorization header"), { statusCode: 401 });
  }
  try {
    if (!RESOLVED) throw new Error("Clerk not configured");
    jwks ??= createRemoteJWKSet(new URL(RESOLVED.jwksUrl));
    const { payload } = await jwtVerify(token, jwks, {
      issuer: RESOLVED.issuer,
      ...(CLERK_AUDIENCE ? { audience: CLERK_AUDIENCE } : {}),
    });
    const orgId = (payload.org_id as string) || defaultOrg;
    // org_role from Clerk's session token (e.g. org:admin / org:member).
    const orgRole = typeof payload.org_role === "string" ? payload.org_role : null;
    return { userId: (payload.sub as string) || null, orgId, mode: "clerk", role: orgRole };
  } catch (err) {
    throw Object.assign(new Error("Invalid or expired token"), {
      statusCode: 401,
      cause: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * RBAC (F38): admin-only mutations — org memory purge, lead list access.
 * In development mode everything is allowed (clearly labeled); under Clerk the
 * token's org_role must be `org:admin` (or an env-listed admin user id).
 */
export function requireAdmin(req: VeryaRequestLike): void {
  if (req.auth.mode === "development") return;
  const adminIds = (process.env.CLERK_ADMIN_USER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const isAdmin = req.auth.role === "org:admin" || (req.auth.userId ? adminIds.includes(req.auth.userId) : false);
  if (!isAdmin) {
    throw Object.assign(new Error("Admin role required"), { statusCode: 403 });
  }
}

/** Public (unauthenticated-under-Clerk) API prefixes: health + lead capture. */
export const PUBLIC_API_PREFIXES = ["/health", "/api/leads"];

type VeryaRequestLike = {
  auth: AuthContext;
};

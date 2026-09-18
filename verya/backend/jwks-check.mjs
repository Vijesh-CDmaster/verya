// Throwaway check: derive Clerk domain from publishable key and fetch JWKS.
import fs from "fs";

const line = fs
  .readFileSync(".env", "utf8")
  .split(/\r?\n/)
  .find((l) => l.startsWith("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="));
const key = line.split("=")[1];
const m = key.match(/^p[ks]_(?:test|live)_([A-Za-z0-9_-]+)$/);
const raw = Buffer.from(m[1], "base64url").toString("utf8");
const domain = raw.replace(/\$$/, "").trim();
console.log("raw decoded:", JSON.stringify(raw));
console.log("clean domain:", domain);
try {
  const res = await fetch(`https://${domain}/.well-known/jwks.json`);
  const j = await res.json();
  console.log("JWKS status:", res.status, "keys:", (j.keys || []).length);
} catch (e) {
  console.log("JWKS fetch failed:", e.message);
}

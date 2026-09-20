import dotenv from "dotenv";
import path from "node:path";

// Load environment variables before modules that read them during initialization.
dotenv.config();
// Tests must stay OFFLINE (devstore): the security suites use synthetic org ids
// that violate real FKs, and no test may touch the shared Neon database. VERYA_TEST_MODE
// is set by `npm test` only; it also wins when a parent process pre-set DATABASE_URL.
if (process.env.VERYA_TEST_MODE === "1") {
  delete process.env.DATABASE_URL;
  delete process.env.neon_db;
} else {
  dotenv.config({ path: path.resolve(process.cwd(), "../.env.local") });
}

// Verya — Neon Postgres pool. The single database access point for all repositories.
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.DATABASE_URL) {
  console.warn(
    "[db] DATABASE_URL is not set. The API will start but every database-backed " +
      "route will fail with a clear error until Neon Postgres is configured."
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 10),
  ssl: process.env.PGSSL_DISABLE === "1" ? undefined : { rejectUnauthorized: false },
});

export async function query<T = unknown>(text: string, params?: unknown[]): Promise<T[]> {
  const res = await pool.query(text, params as never[]);
  return res.rows as T[];
}

/** Throws a clean error when the database is not configured. */
export function requireDb(): void {
  if (!process.env.DATABASE_URL) {
    const err = new Error(
      "DATABASE_URL is not configured. Add your Neon connection string to backend/.env and restart."
    );
    err.name = "DbNotConfigured";
    throw err;
  }
}

export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

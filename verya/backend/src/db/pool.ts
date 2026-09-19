// Verya — Neon Postgres pool. The single database access point for all repositories.
import { Pool } from "pg";
import "../config/env";

const databaseUrl = process.env.DATABASE_URL || process.env.neon_db;

if (!databaseUrl) {
  console.warn(
    "[db] DATABASE_URL is not set. The API will start but every database-backed " +
      "route will fail with a clear error until Neon Postgres is configured."
  );
}

export const pool = new Pool({
  connectionString: databaseUrl,
  max: Number(process.env.PG_POOL_MAX || 10),
  ssl: process.env.PGSSL_DISABLE === "1" ? undefined : { rejectUnauthorized: false },
});

export async function query<T = unknown>(text: string, params?: unknown[]): Promise<T[]> {
  const res = await pool.query(text, params as never[]);
  return res.rows as T[];
}

/** Throws a clean error when the database is not configured. */
export function requireDb(): void {
  if (!databaseUrl) {
    const err = new Error(
      "DATABASE_URL is not configured. Add your Neon connection string to backend/.env and restart."
    );
    err.name = "DbNotConfigured";
    throw err;
  }
}

export function isDbConfigured(): boolean {
  return Boolean(databaseUrl);
}

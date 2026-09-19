-- Verya — Neon Postgres schema (v1)
-- Postgres + pgvector only. No other database engines.

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------- Organizations (tenant isolation root) ----------
CREATE TABLE IF NOT EXISTS organizations (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO organizations (id, name)
VALUES ('default-org', 'Default Organization')
ON CONFLICT (id) DO NOTHING;

-- ---------- Users (Clerk identity mirror; auth lives in Clerk) ----------
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,            -- Clerk user id
  org_id       TEXT NOT NULL REFERENCES organizations(id),
  email        TEXT,
  display_name TEXT,
  role         TEXT NOT NULL DEFAULT 'member', -- admin|owner|member|reviewer|auditor
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ
);
-- Keep the migration compatible with older local schemas that already had a
-- users table without organization scoping.
ALTER TABLE users ADD COLUMN IF NOT EXISTS org_id TEXT;
CREATE INDEX IF NOT EXISTS users_org_idx ON users(org_id);

-- ---------- Pipeline sessions (the whole gated pipeline state as JSONB) ----------
CREATE TABLE IF NOT EXISTS sessions (
  id          UUID PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  title       TEXT NOT NULL DEFAULT 'Untitled project',
  gate        TEXT NOT NULL DEFAULT 'intake',
  gate_status TEXT NOT NULL DEFAULT 'pending',
  state       JSONB NOT NULL                -- full PipelineSession payload
);
CREATE INDEX IF NOT EXISTS sessions_org_idx ON sessions(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sessions_gate_idx ON sessions(org_id, gate);

-- ---------- Trust Ledger: append-only + hash-chained (F10) ----------
-- No UPDATE/DELETE grants in normal app flow; corrections are new rows with
-- correction_of referencing the original. chain_hash = SHA-256(prev_hash || payload).
CREATE TABLE IF NOT EXISTS ledger_entries (
  seq           BIGSERIAL PRIMARY KEY,
  org_id        TEXT NOT NULL,
  session_id    UUID,
  gate          TEXT NOT NULL,
  event_type    TEXT NOT NULL,
  actor         TEXT NOT NULL DEFAULT 'ai',   -- ai|human|system
  model         TEXT,
  task_id       TEXT,
  detail        JSONB NOT NULL DEFAULT '{}'::jsonb,
  verification  JSONB,
  human_edit    JSONB,
  prev_hash     TEXT NOT NULL,
  chain_hash    TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_org_time_idx ON ledger_entries(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ledger_session_idx ON ledger_entries(session_id);
CREATE INDEX IF NOT EXISTS ledger_model_idx ON ledger_entries(org_id, model) WHERE model IS NOT NULL;
CREATE INDEX IF NOT EXISTS ledger_event_idx ON ledger_entries(org_id, event_type);

-- ---------- Organization memory (F9) with pgvector similarity ----------
CREATE TABLE IF NOT EXISTS org_memory (
  id           BIGSERIAL PRIMARY KEY,
  org_id       TEXT NOT NULL,
  session_id   UUID,
  task_category TEXT NOT NULL,
  model        TEXT NOT NULL,
  outcome      TEXT NOT NULL,                 -- accepted|edited|rejected|escalated|verified|flagged
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,                 -- prompt/decision summary for retrieval
  embedding    vector(1536),
  meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS org_memory_org_idx ON org_memory(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS org_memory_cat_idx ON org_memory(org_id, task_category);
-- IVFFlat index activates once the table has rows (needs known cluster point):
CREATE INDEX IF NOT EXISTS org_memory_vec_idx ON org_memory USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ---------- Model reputation (F12): living scores per model x category ----------
CREATE TABLE IF NOT EXISTS model_reputation (
  org_id        TEXT NOT NULL,
  model         TEXT NOT NULL,
  task_category TEXT NOT NULL,
  trust_score   REAL NOT NULL DEFAULT 50,
  samples       INTEGER NOT NULL DEFAULT 0,
  trend         TEXT NOT NULL DEFAULT 'flat',
  last_updated  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, model, task_category)
);

-- ---------- Migration bookkeeping ----------
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

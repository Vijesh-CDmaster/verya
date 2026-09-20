-- Verya — Agent Registry schema (F23)
-- Organization-scoped persistent identities with declared capabilities, autonomy, and lifecycle governance.

CREATE TABLE IF NOT EXISTS agents (
  agent_id         TEXT PRIMARY KEY,
  org_id           TEXT NOT NULL REFERENCES organizations(id),
  owner            TEXT NOT NULL,
  name             TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  purpose          TEXT NOT NULL,
  agent_type       TEXT NOT NULL DEFAULT 'custom',
  autonomy_level   TEXT NOT NULL DEFAULT 'LEVEL_1',
  allowed_models   JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_tools    JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_actions  JSONB NOT NULL DEFAULT '[]'::jsonb,
  data_scope       TEXT NOT NULL DEFAULT 'organization',
  risk_level       TEXT NOT NULL DEFAULT 'low',
  status           TEXT NOT NULL DEFAULT 'active',
  version          INTEGER NOT NULL DEFAULT 1,
  parent_agent_id  TEXT REFERENCES agents(agent_id) ON DELETE SET NULL,
  delegation_chain JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agents_org_idx ON agents(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agents_status_idx ON agents(org_id, status);
CREATE INDEX IF NOT EXISTS agents_type_idx ON agents(org_id, agent_type);
CREATE INDEX IF NOT EXISTS agents_parent_idx ON agents(parent_agent_id) WHERE parent_agent_id IS NOT NULL;

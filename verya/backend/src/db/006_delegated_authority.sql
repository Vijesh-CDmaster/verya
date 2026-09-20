-- Verya — Delegated Authority & Capability Grants schema (F23 Phase 4)
-- Organization-scoped delegation records, capability grants, resource scoping, and hierarchy bounds.

CREATE TABLE IF NOT EXISTS delegations (
  delegation_id        TEXT PRIMARY KEY,
  org_id               TEXT NOT NULL REFERENCES organizations(id),
  delegator_user_id    TEXT NOT NULL,
  agent_id             TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  parent_delegation_id TEXT REFERENCES delegations(delegation_id) ON DELETE SET NULL,
  purpose              TEXT NOT NULL,
  allowed_actions      JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_tools        JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_resources    JSONB NOT NULL DEFAULT '[]'::jsonb,
  data_scope           TEXT NOT NULL DEFAULT 'organization',
  maximum_risk         TEXT NOT NULL DEFAULT 'low',
  constraints          JSONB NOT NULL DEFAULT '{}'::jsonb,
  can_delegate         BOOLEAN NOT NULL DEFAULT false,
  issued_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at           TIMESTAMPTZ NOT NULL,
  status               TEXT NOT NULL DEFAULT 'ACTIVE',
  version              INTEGER NOT NULL DEFAULT 1,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delegations_org_idx ON delegations(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS delegations_agent_idx ON delegations(org_id, agent_id);
CREATE INDEX IF NOT EXISTS delegations_status_idx ON delegations(org_id, status);
CREATE INDEX IF NOT EXISTS delegations_parent_idx ON delegations(parent_delegation_id) WHERE parent_delegation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS delegations_expires_idx ON delegations(expires_at);

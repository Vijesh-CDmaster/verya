-- F17: durable, human-approved governance policy suggestions and version history.
CREATE TABLE IF NOT EXISTS policy_suggestions (
  id          BIGSERIAL PRIMARY KEY,
  org_id      TEXT NOT NULL,
  version     INTEGER NOT NULL,
  rule        TEXT NOT NULL,
  rationale   TEXT NOT NULL,
  evidence    JSONB NOT NULL DEFAULT '{}'::jsonb,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at  TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS policy_suggestions_org_version_idx ON policy_suggestions(org_id, version);
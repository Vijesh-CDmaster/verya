-- Verya — lead capture (v2)
-- Marketing lead records. Append-only in application flow: rows are inserted once
-- and never updated or deleted through the API.

CREATE TABLE IF NOT EXISTS leads (
  id          BIGSERIAL PRIMARY KEY,
  org_id      TEXT NOT NULL DEFAULT 'marketing',
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT,
  source      TEXT NOT NULL DEFAULT 'website',
  accepted_terms_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leads_email_idx ON leads(email);
CREATE INDEX IF NOT EXISTS leads_created_idx ON leads(created_at DESC);

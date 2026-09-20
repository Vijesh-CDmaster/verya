-- F10: make append-only corrections directly queryable.
ALTER TABLE ledger_entries
  ADD COLUMN IF NOT EXISTS correction_of BIGINT REFERENCES ledger_entries(seq);

CREATE INDEX IF NOT EXISTS ledger_correction_idx ON ledger_entries(org_id, correction_of)
  WHERE correction_of IS NOT NULL;
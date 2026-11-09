-- Private options journal: first PostgreSQL migration.
-- Apply to a new Neon database. The browser must never receive DATABASE_URL.
BEGIN;

CREATE TABLE IF NOT EXISTS journal_transactions (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  note text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'app',
  CHECK (length(owner_id) BETWEEN 1 AND 255)
);

CREATE TABLE IF NOT EXISTS journal_revisions (
  owner_id text NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN
    ('accounts','trades','legs','actions','quotes','lists','settings')),
  record_id text NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  transaction_id uuid NOT NULL REFERENCES journal_transactions(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted boolean NOT NULL DEFAULT false,
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  PRIMARY KEY (owner_id, entity_type, record_id, revision),
  UNIQUE (transaction_id, entity_type, record_id),
  CHECK (length(record_id) BETWEEN 1 AND 255)
);

CREATE INDEX IF NOT EXISTS journal_revisions_latest
  ON journal_revisions (owner_id, entity_type, record_id, revision DESC);
CREATE INDEX IF NOT EXISTS journal_revisions_transaction
  ON journal_revisions (transaction_id);

CREATE TABLE IF NOT EXISTS journal_history (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL,
  transaction_id uuid NOT NULL REFERENCES journal_transactions(id),
  entity_type text NOT NULL,
  record_id text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  before_deleted boolean NOT NULL DEFAULT false,
  after_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS journal_history_owner_created
  ON journal_history (owner_id, created_at DESC);

-- Snapshot of legacy All Data rows, kept separate from revisioned records.
CREATE TABLE IF NOT EXISTS journal_legacy_rows (
  owner_id text NOT NULL,
  source_key text NOT NULL,
  row_key text NOT NULL,
  source_position integer NOT NULL CHECK (source_position > 0),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, source_key, row_key)
);

-- Restrict all tables to the server connection. Do not expose them through
-- a browser-facing Data API or grant access to public roles.
REVOKE ALL ON journal_transactions, journal_revisions,
  journal_history, journal_legacy_rows FROM PUBLIC;

COMMIT;

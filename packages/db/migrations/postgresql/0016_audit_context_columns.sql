-- §2.2 context columns: excluded from hash payload (appended after chain was established).
-- All columns are nullable (or have a DEFAULT) so existing rows remain chain-valid.

ALTER TABLE "admin_audit"
  ADD COLUMN IF NOT EXISTS "schema_version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "actor_name" VARCHAR(256),
  ADD COLUMN IF NOT EXISTS "actor_json" TEXT,
  ADD COLUMN IF NOT EXISTS "context_ip" VARCHAR(45),
  ADD COLUMN IF NOT EXISTS "context_user_agent" VARCHAR(240),
  ADD COLUMN IF NOT EXISTS "context_request_id" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "context_method" VARCHAR(10),
  ADD COLUMN IF NOT EXISTS "context_path" VARCHAR(2048),
  ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Full-text search: generated tsvector over the searchable text fields.
-- The GENERATED ALWAYS AS ... STORED clause requires PostgreSQL 12+.
ALTER TABLE "admin_audit"
  ADD COLUMN IF NOT EXISTS "search_vector" TSVECTOR
    GENERATED ALWAYS AS (
      to_tsvector('english',
        coalesce("userEmail", '') || ' ' ||
        coalesce("action", '') || ' ' ||
        coalesce("targetId", '') || ' ' ||
        coalesce("detail", '')
      )
    ) STORED;

CREATE INDEX IF NOT EXISTS "admin_audit_search_vector_idx" ON "admin_audit" USING GIN("search_vector");
CREATE INDEX IF NOT EXISTS "admin_audit_created_at_idx" ON "admin_audit"("created_at" DESC);
CREATE INDEX IF NOT EXISTS "admin_audit_context_request_id_idx" ON "admin_audit"("context_request_id");

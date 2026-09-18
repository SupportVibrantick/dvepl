-- Mirror the reference project's audit richness: a denormalized display name
-- (kept even after the record is deleted), a human-readable description, and a
-- SUCCESS / FAILED status so failures surface in the audit trail.
ALTER TABLE "audit_logs"
  ADD COLUMN "entityName" TEXT,
  ADD COLUMN "details" TEXT,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'SUCCESS';
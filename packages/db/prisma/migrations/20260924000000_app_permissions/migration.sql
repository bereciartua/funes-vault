-- Breaking permission model: keep the newest policy deterministically.
CREATE TYPE "MemoryRequestReason" AS ENUM ('unknown_or_blocked_client', 'no_client_policy', 'policy_expired', 'operation_not_allowed', 'no_matching_memories', 'no_allowed_memories', 'confirmation_required', 'policy_changed', 'inactive_memory', 'unapproved_memory', 'expired_memory', 'above_sensitivity_ceiling', 'denied_category', 'category_not_allowed');
ALTER TYPE "AuditEventType" ADD VALUE 'MEMORY_SUGGESTION_DENIED';
-- Invalid cross-owner grants cannot survive the new ownership constraint.
DELETE FROM "Policy" p USING "Client" c WHERE p."clientId" = c.id AND p."userId" <> c."userId";
DELETE FROM "Policy" WHERE id IN (
 SELECT id FROM (SELECT id, row_number() OVER (PARTITION BY "clientId" ORDER BY "updatedAt" DESC, id DESC) AS rank FROM "Policy") ranked WHERE rank > 1
);
DROP INDEX "Policy_clientId_purpose_key";
DROP INDEX "Policy_purpose_idx";
ALTER TABLE "Policy" DROP COLUMN purpose;
CREATE UNIQUE INDEX "Policy_clientId_key" ON "Policy"("clientId");
CREATE UNIQUE INDEX "Client_id_userId_key" ON "Client"(id, "userId");
ALTER TABLE "Policy" DROP CONSTRAINT "Policy_clientId_fkey";
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_clientId_userId_fkey" FOREIGN KEY ("clientId", "userId") REFERENCES "Client"(id, "userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemoryRequest" RENAME COLUMN purpose TO "statedPurpose";
ALTER TABLE "MemoryRequest" ALTER COLUMN "statedPurpose" DROP NOT NULL;
ALTER TABLE "MemoryRequest" ADD COLUMN "policyId" TEXT, ADD COLUMN "policyVersion" TEXT, ADD COLUMN "decisionReason" "MemoryRequestReason";
ALTER TABLE "MemoryRequest" ADD CONSTRAINT "MemoryRequest_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MemorySuggestion" ADD COLUMN "statedPurpose" TEXT, ADD COLUMN "policyId" TEXT;
ALTER TABLE "MemorySuggestion" ADD CONSTRAINT "MemorySuggestion_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"(id) ON DELETE SET NULL ON UPDATE CASCADE;
-- Existing untrusted metadata must not become dispatch authority after upgrade.
UPDATE "MemorySuggestion" SET "sourceMetadata" = jsonb_build_object('caller', "sourceMetadata") WHERE "sourceType" = 'CLIENT_SUGGESTION';

CREATE INDEX "MemoryRequest_policyId_idx" ON "MemoryRequest"("policyId");
CREATE INDEX "MemorySuggestion_policyId_idx" ON "MemorySuggestion"("policyId");

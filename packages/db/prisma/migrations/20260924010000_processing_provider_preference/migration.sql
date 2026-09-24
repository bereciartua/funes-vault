ALTER TYPE "AuditEventType" ADD VALUE 'PROCESSING_PROVIDER_SELECTED';

CREATE TABLE "ProcessingProviderPreference" (
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "system" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProcessingProviderPreference_pkey" PRIMARY KEY ("userId","scope")
);

ALTER TABLE "ProcessingProviderPreference" ADD CONSTRAINT "ProcessingProviderPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve an owner's explicit TypeSafe revocation when the old button is retired.
INSERT INTO "ProcessingProviderPreference" ("userId", "scope", "system", "updatedAt")
SELECT "userId", "scope", 'system_2', NOW()
FROM "ProcessingConsent"
WHERE "processor" = 'typesafe' AND "revokedAt" IS NOT NULL
  AND "scope" IN ('extraction', 'consolidation');

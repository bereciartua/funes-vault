CREATE EXTENSION IF NOT EXISTS vector;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN', 'OWNER');

-- CreateEnum
CREATE TYPE "MemoryKind" AS ENUM ('FACT', 'PREFERENCE', 'INSTRUCTION', 'GOAL', 'PROJECT_CONTEXT', 'RELATIONSHIP', 'CONSTRAINT', 'EVENT', 'SUMMARY');

-- CreateEnum
CREATE TYPE "MemorySensitivity" AS ENUM ('PUBLIC', 'LOW', 'INTERNAL', 'SENSITIVE', 'RESTRICTED', 'SECRET');

-- CreateEnum
CREATE TYPE "MemoryStatus" AS ENUM ('SUGGESTED', 'ACTIVE', 'ARCHIVED', 'EXPIRED', 'DELETED');

-- CreateEnum
CREATE TYPE "ReviewState" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('MANUAL', 'IMPORT', 'CHAT', 'CLIENT_SUGGESTION', 'CONSOLIDATION', 'API', 'DERIVED');

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('LOCAL_AGENT', 'MCP_CLIENT', 'CLI', 'WEB_APP', 'BROWSER_EXTENSION', 'HOSTED_APP', 'OTHER');

-- CreateEnum
CREATE TYPE "ClientTrustLevel" AS ENUM ('UNKNOWN', 'APPROVED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ClientRetention" AS ENUM ('NO_STORAGE', 'SESSION', 'PERSISTENT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PolicyOperation" AS ENUM ('READ', 'SUGGEST', 'WRITE', 'SUMMARIZE', 'EXPORT');

-- CreateEnum
CREATE TYPE "MemoryRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'NEEDS_USER_APPROVAL', 'DENIED', 'FULFILLED', 'FAILED');

-- CreateEnum
CREATE TYPE "MemorySuggestionStatus" AS ENUM ('QUEUED_FOR_REVIEW', 'APPROVED', 'REJECTED', 'APPLIED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM ('MEMORY_PROCESSING_COMPLETED', 'PROCESSING_CONSENT_UPDATED', 'MEMORY_CREATED', 'MEMORY_UPDATED', 'MEMORY_ARCHIVED', 'MEMORY_DELETED', 'MEMORY_DISCLOSURE', 'MEMORY_REQUEST_APPROVED', 'MEMORY_REQUEST_DENIED', 'MEMORY_SUGGESTION_CREATED', 'MEMORY_SUGGESTION_APPROVED', 'MEMORY_SUGGESTION_REJECTED', 'CLIENT_CREATED', 'CLIENT_UPDATED', 'CLIENT_TOKEN_ROTATED', 'POLICY_CREATED', 'POLICY_UPDATED', 'POLICY_DELETED', 'OAUTH_GRANT_APPROVED', 'OAUTH_GRANT_DENIED', 'OAUTH_TOKEN_ISSUED', 'OAUTH_TOKEN_REVOKED', 'JOB_CREATED', 'JOB_COMPLETED', 'JOB_FAILED');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'CLIENT', 'SYSTEM', 'JOB');

-- CreateEnum
CREATE TYPE "MemoryProvenanceEntryType" AS ENUM ('CREATED', 'IMPORTED', 'SUGGESTED', 'SOURCE_UPDATED', 'CONTENT_UPDATED', 'STATUS_CHANGED', 'ARCHIVED', 'RESTORED', 'DELETED', 'CONSOLIDATION_INSPECTED', 'CONSOLIDATION_SUGGESTED', 'CONSOLIDATION_APPLIED', 'DERIVED');

-- CreateEnum
CREATE TYPE "ProvenanceSubjectType" AS ENUM ('MEMORY', 'MEMORY_SUGGESTION', 'JOB_RUN', 'AUDIT_EVENT', 'MEMORY_REQUEST', 'CLIENT', 'POLICY', 'IMPORT', 'PROVIDER');

-- CreateEnum
CREATE TYPE "ProvenanceSubjectRole" AS ENUM ('TARGET', 'SOURCE', 'CANONICAL', 'SUPERSEDED_BY', 'DUPLICATE_OF', 'CONFLICTS_WITH', 'DERIVED_FROM', 'DERIVED_OUTPUT', 'SUGGESTION', 'JOB', 'AUDIT_EVENT', 'REQUEST', 'CLIENT', 'POLICY', 'IMPORT_SOURCE', 'MODEL_PROVIDER');

-- CreateEnum
CREATE TYPE "AuditSubjectType" AS ENUM ('MEMORY', 'MEMORY_SUGGESTION', 'JOB_RUN', 'MEMORY_REQUEST', 'CLIENT', 'POLICY', 'IMPORT', 'EXPORT');

-- CreateEnum
CREATE TYPE "AuditSubjectRole" AS ENUM ('TARGET', 'SOURCE', 'CANONICAL', 'DISCLOSED', 'DENIED', 'CREATED', 'UPDATED', 'ARCHIVED', 'DELETED', 'SUGGESTION', 'JOB', 'REQUEST', 'CLIENT', 'POLICY', 'IMPORTED', 'EXPORTED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('GENERATE_EMBEDDING', 'PROCESS_IMPORT', 'CONSOLIDATE_MEMORIES', 'DETECT_CONFLICTS', 'SEND_REVIEW_REMINDER');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ConsolidationMode" AS ENUM ('REVIEW_ONLY', 'AUTO_APPLY');

-- CreateEnum
CREATE TYPE "ChatMessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "OAuthRegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "OAuthTokenType" AS ENUM ('ACCESS', 'REFRESH');

-- CreateEnum
CREATE TYPE "MemoryExtractionRunStatus" AS ENUM ('pending', 'running', 'completed', 'partial', 'skipped', 'failed');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "consolidationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "consolidationMode" "ConsolidationMode" NOT NULL DEFAULT 'REVIEW_ONLY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "titleLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatSessionId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "extractionFingerprint" TEXT,

    CONSTRAINT "VoiceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ChatMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "sourceTimezone" TEXT,
    "submissionId" TEXT,
    "voiceSessionId" TEXT,
    "voiceItemId" TEXT,
    "processing" JSONB NOT NULL DEFAULT '{}',
    "citations" JSONB NOT NULL DEFAULT '[]',
    "suggestedMemoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "provider" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleIdentity" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "GoogleIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "stateHash" TEXT NOT NULL,
    "browserHash" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "returnTo" TEXT NOT NULL,
    "sessionId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("stateHash")
);

-- CreateTable
CREATE TABLE "Session" (
    "deletionVerifiedAt" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryCategory" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemoryCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Memory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "MemoryKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sensitivity" "MemorySensitivity" NOT NULL DEFAULT 'LOW',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "status" "MemoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "reviewState" "ReviewState" NOT NULL DEFAULT 'APPROVED',
    "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "sourceClientId" TEXT,
    "sourceUri" TEXT,
    "sourceMetadata" JSONB NOT NULL DEFAULT '{}',
    "lastConfirmedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "consolidationRelevantAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastConsolidatedAt" TIMESTAMP(3),
    "semanticInspectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Memory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ClientType" NOT NULL,
    "trustLevel" "ClientTrustLevel" NOT NULL DEFAULT 'UNKNOWN',
    "declaredRetention" "ClientRetention" NOT NULL DEFAULT 'UNKNOWN',
    "tokenHash" TEXT,
    "oauthRegistrationId" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthClientRegistration" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "redirectUris" TEXT[],
    "tokenEndpointAuthMethod" TEXT NOT NULL DEFAULT 'none',
    "grantTypes" TEXT[] DEFAULT ARRAY['authorization_code', 'refresh_token']::TEXT[],
    "scope" TEXT,
    "clientUri" TEXT,
    "logoUri" TEXT,
    "contacts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "OAuthRegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthClientRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthAuthorizationRequest" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "scopes" TEXT[],
    "state" TEXT,
    "resource" TEXT,
    "csrfTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthAuthorizationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthAuthorizationCode" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "scopes" TEXT[],
    "resource" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthAuthorizationCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthToken" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "OAuthTokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "resource" TEXT,
    "sourceCodeId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "maxSensitivity" "MemorySensitivity" NOT NULL DEFAULT 'INTERNAL',
    "operations" "PolicyOperation"[] DEFAULT ARRAY['READ']::"PolicyOperation"[],
    "requiresConfirmation" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "status" "MemoryRequestStatus" NOT NULL DEFAULT 'PENDING',
    "tokenBudget" INTEGER NOT NULL DEFAULT 1200,
    "requestedCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "retention" "ClientRetention" NOT NULL DEFAULT 'UNKNOWN',
    "thirdPartyProcessors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reviewSnapshot" JSONB NOT NULL DEFAULT '{}',
    "approvalExpiresAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "deniedAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemoryRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryRequestItem" (
    "id" TEXT NOT NULL,
    "memoryRequestId" TEXT NOT NULL,
    "memoryId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "categoryKey" TEXT,
    "sensitivity" "MemorySensitivity" NOT NULL,
    "relevanceScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemorySuggestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "sourceClientId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "suggestedKind" "MemoryKind" NOT NULL,
    "suggestedSensitivity" "MemorySensitivity" NOT NULL DEFAULT 'LOW',
    "suggestedCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "evidence" TEXT,
    "sourceMetadata" JSONB NOT NULL DEFAULT '{}',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "status" "MemorySuggestionStatus" NOT NULL DEFAULT 'QUEUED_FOR_REVIEW',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemorySuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Embedding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "memoryId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "vector" vector(1536) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Embedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT,
    "memoryRequestId" TEXT,
    "type" "AuditEventType" NOT NULL,
    "actorType" "AuditActorType" NOT NULL,
    "actorId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryProvenanceEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "memoryId" TEXT NOT NULL,
    "type" "MemoryProvenanceEntryType" NOT NULL,
    "actorType" "AuditActorType" NOT NULL,
    "actorId" TEXT,
    "sourceType" "SourceType",
    "sourceClientId" TEXT,
    "sourceUri" TEXT,
    "suggestionId" TEXT,
    "jobRunId" TEXT,
    "auditEventId" TEXT,
    "memoryRequestId" TEXT,
    "reason" TEXT,
    "evidence" TEXT,
    "confidence" DOUBLE PRECISION,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryProvenanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryProvenanceSubject" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provenanceEntryId" TEXT NOT NULL,
    "subjectType" "ProvenanceSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "role" "ProvenanceSubjectRole" NOT NULL,
    "labelSnapshot" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryProvenanceSubject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEventSubject" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "auditEventId" TEXT NOT NULL,
    "subjectType" "AuditSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "role" "AuditSubjectRole" NOT NULL,
    "labelSnapshot" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEventSubject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryExtractionRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceMessageId" TEXT NOT NULL,
    "configuration" JSONB NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" "MemoryExtractionRunStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "claimToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "result" JSONB NOT NULL DEFAULT '{}',
    "pendingCandidates" JSONB NOT NULL DEFAULT '[]',
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "MemoryExtractionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryCandidateApplication" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryCandidateApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingConsent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "processor" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ProcessingConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PolicyAllowedCategories" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PolicyAllowedCategories_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_PolicyDeniedCategories" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PolicyDeniedCategories_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_MemoryCategories" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_MemoryCategories_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "ChatSession_userId_updatedAt_idx" ON "ChatSession"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "VoiceSession_userId_startedAt_idx" ON "VoiceSession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_createdAt_idx" ON "ChatMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_userId_createdAt_idx" ON "ChatMessage"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_userId_submissionId_key" ON "ChatMessage"("userId", "submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_voiceSessionId_voiceItemId_role_key" ON "ChatMessage"("voiceSessionId", "voiceItemId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleIdentity_subject_key" ON "GoogleIdentity"("subject");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleIdentity_userId_key" ON "GoogleIdentity"("userId");

-- CreateIndex
CREATE INDEX "LoginAttempt_expiresAt_idx" ON "LoginAttempt"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MemoryCategory_key_key" ON "MemoryCategory"("key");

-- CreateIndex
CREATE INDEX "Memory_userId_status_idx" ON "Memory"("userId", "status");

-- CreateIndex
CREATE INDEX "Memory_userId_status_consolidationRelevantAt_idx" ON "Memory"("userId", "status", "consolidationRelevantAt");

-- CreateIndex
CREATE INDEX "Memory_userId_status_expiresAt_idx" ON "Memory"("userId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "Memory_userId_sensitivity_idx" ON "Memory"("userId", "sensitivity");

-- CreateIndex
CREATE INDEX "Memory_sourceClientId_idx" ON "Memory"("sourceClientId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_tokenHash_key" ON "Client"("tokenHash");

-- CreateIndex
CREATE INDEX "Client_userId_idx" ON "Client"("userId");

-- CreateIndex
CREATE INDEX "Client_userId_trustLevel_idx" ON "Client"("userId", "trustLevel");

-- CreateIndex
CREATE UNIQUE INDEX "Client_userId_name_key" ON "Client"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Client_userId_oauthRegistrationId_key" ON "Client"("userId", "oauthRegistrationId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthClientRegistration_clientId_key" ON "OAuthClientRegistration"("clientId");

-- CreateIndex
CREATE INDEX "OAuthClientRegistration_status_idx" ON "OAuthClientRegistration"("status");

-- CreateIndex
CREATE INDEX "OAuthClientRegistration_createdAt_idx" ON "OAuthClientRegistration"("createdAt");

-- CreateIndex
CREATE INDEX "OAuthAuthorizationRequest_expiresAt_idx" ON "OAuthAuthorizationRequest"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAuthorizationCode_codeHash_key" ON "OAuthAuthorizationCode"("codeHash");

-- CreateIndex
CREATE INDEX "OAuthAuthorizationCode_expiresAt_idx" ON "OAuthAuthorizationCode"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthToken_tokenHash_key" ON "OAuthToken"("tokenHash");

-- CreateIndex
CREATE INDEX "OAuthToken_clientId_type_idx" ON "OAuthToken"("clientId", "type");

-- CreateIndex
CREATE INDEX "OAuthToken_sourceCodeId_idx" ON "OAuthToken"("sourceCodeId");

-- CreateIndex
CREATE INDEX "OAuthToken_expiresAt_idx" ON "OAuthToken"("expiresAt");

-- CreateIndex
CREATE INDEX "Policy_userId_idx" ON "Policy"("userId");

-- CreateIndex
CREATE INDEX "Policy_purpose_idx" ON "Policy"("purpose");

-- CreateIndex
CREATE UNIQUE INDEX "Policy_clientId_purpose_key" ON "Policy"("clientId", "purpose");

-- CreateIndex
CREATE INDEX "MemoryRequest_userId_status_idx" ON "MemoryRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "MemoryRequest_clientId_idx" ON "MemoryRequest"("clientId");

-- CreateIndex
CREATE INDEX "MemoryRequest_createdAt_idx" ON "MemoryRequest"("createdAt");

-- CreateIndex
CREATE INDEX "MemoryRequestItem_memoryId_idx" ON "MemoryRequestItem"("memoryId");

-- CreateIndex
CREATE UNIQUE INDEX "MemoryRequestItem_memoryRequestId_memoryId_key" ON "MemoryRequestItem"("memoryRequestId", "memoryId");

-- CreateIndex
CREATE INDEX "MemorySuggestion_userId_status_idx" ON "MemorySuggestion"("userId", "status");

-- CreateIndex
CREATE INDEX "MemorySuggestion_sourceClientId_idx" ON "MemorySuggestion"("sourceClientId");

-- CreateIndex
CREATE INDEX "Embedding_userId_idx" ON "Embedding"("userId");

-- CreateIndex
CREATE INDEX "Embedding_provider_model_idx" ON "Embedding"("provider", "model");

-- CreateIndex
CREATE UNIQUE INDEX "Embedding_memoryId_provider_model_contentHash_key" ON "Embedding"("memoryId", "provider", "model", "contentHash");

-- CreateIndex
CREATE INDEX "AuditEvent_userId_createdAt_idx" ON "AuditEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_clientId_idx" ON "AuditEvent"("clientId");

-- CreateIndex
CREATE INDEX "AuditEvent_memoryRequestId_idx" ON "AuditEvent"("memoryRequestId");

-- CreateIndex
CREATE INDEX "AuditEvent_type_idx" ON "AuditEvent"("type");

-- CreateIndex
CREATE INDEX "MemoryProvenanceEntry_userId_memoryId_createdAt_idx" ON "MemoryProvenanceEntry"("userId", "memoryId", "createdAt");

-- CreateIndex
CREATE INDEX "MemoryProvenanceEntry_userId_type_createdAt_idx" ON "MemoryProvenanceEntry"("userId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "MemoryProvenanceEntry_suggestionId_idx" ON "MemoryProvenanceEntry"("suggestionId");

-- CreateIndex
CREATE INDEX "MemoryProvenanceEntry_jobRunId_idx" ON "MemoryProvenanceEntry"("jobRunId");

-- CreateIndex
CREATE INDEX "MemoryProvenanceEntry_auditEventId_idx" ON "MemoryProvenanceEntry"("auditEventId");

-- CreateIndex
CREATE INDEX "MemoryProvenanceSubject_userId_subjectType_subjectId_idx" ON "MemoryProvenanceSubject"("userId", "subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "MemoryProvenanceSubject_provenanceEntryId_idx" ON "MemoryProvenanceSubject"("provenanceEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "MemoryProvenanceSubject_provenanceEntryId_subjectType_subje_key" ON "MemoryProvenanceSubject"("provenanceEntryId", "subjectType", "subjectId", "role");

-- CreateIndex
CREATE INDEX "AuditEventSubject_userId_subjectType_subjectId_idx" ON "AuditEventSubject"("userId", "subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "AuditEventSubject_auditEventId_idx" ON "AuditEventSubject"("auditEventId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEventSubject_auditEventId_subjectType_subjectId_role_key" ON "AuditEventSubject"("auditEventId", "subjectType", "subjectId", "role");

-- CreateIndex
CREATE INDEX "JobRun_userId_idx" ON "JobRun"("userId");

-- CreateIndex
CREATE INDEX "JobRun_type_status_idx" ON "JobRun"("type", "status");

-- CreateIndex
CREATE INDEX "JobRun_createdAt_idx" ON "JobRun"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MemoryExtractionRun_sourceMessageId_key" ON "MemoryExtractionRun"("sourceMessageId");

-- CreateIndex
CREATE INDEX "MemoryExtractionRun_userId_status_idx" ON "MemoryExtractionRun"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MemoryCandidateApplication_runId_candidateId_key" ON "MemoryCandidateApplication"("runId", "candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessingConsent_userId_processor_scope_key" ON "ProcessingConsent"("userId", "processor", "scope");

-- CreateIndex
CREATE INDEX "_PolicyAllowedCategories_B_index" ON "_PolicyAllowedCategories"("B");

-- CreateIndex
CREATE INDEX "_PolicyDeniedCategories_B_index" ON "_PolicyDeniedCategories"("B");

-- CreateIndex
CREATE INDEX "_MemoryCategories_B_index" ON "_MemoryCategories"("B");

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceSession" ADD CONSTRAINT "VoiceSession_chatSessionId_fkey" FOREIGN KEY ("chatSessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceSession" ADD CONSTRAINT "VoiceSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleIdentity" ADD CONSTRAINT "GoogleIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Memory" ADD CONSTRAINT "Memory_sourceClientId_fkey" FOREIGN KEY ("sourceClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Memory" ADD CONSTRAINT "Memory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_oauthRegistrationId_fkey" FOREIGN KEY ("oauthRegistrationId") REFERENCES "OAuthClientRegistration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthAuthorizationRequest" ADD CONSTRAINT "OAuthAuthorizationRequest_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "OAuthClientRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthAuthorizationCode" ADD CONSTRAINT "OAuthAuthorizationCode_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthAuthorizationCode" ADD CONSTRAINT "OAuthAuthorizationCode_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "OAuthClientRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthAuthorizationCode" ADD CONSTRAINT "OAuthAuthorizationCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthToken" ADD CONSTRAINT "OAuthToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthToken" ADD CONSTRAINT "OAuthToken_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "OAuthClientRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthToken" ADD CONSTRAINT "OAuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryRequest" ADD CONSTRAINT "MemoryRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryRequest" ADD CONSTRAINT "MemoryRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryRequestItem" ADD CONSTRAINT "MemoryRequestItem_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "Memory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryRequestItem" ADD CONSTRAINT "MemoryRequestItem_memoryRequestId_fkey" FOREIGN KEY ("memoryRequestId") REFERENCES "MemoryRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemorySuggestion" ADD CONSTRAINT "MemorySuggestion_sourceClientId_fkey" FOREIGN KEY ("sourceClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemorySuggestion" ADD CONSTRAINT "MemorySuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Embedding" ADD CONSTRAINT "Embedding_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "Memory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Embedding" ADD CONSTRAINT "Embedding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_memoryRequestId_fkey" FOREIGN KEY ("memoryRequestId") REFERENCES "MemoryRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryProvenanceEntry" ADD CONSTRAINT "MemoryProvenanceEntry_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "Memory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryProvenanceEntry" ADD CONSTRAINT "MemoryProvenanceEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryProvenanceSubject" ADD CONSTRAINT "MemoryProvenanceSubject_provenanceEntryId_fkey" FOREIGN KEY ("provenanceEntryId") REFERENCES "MemoryProvenanceEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryProvenanceSubject" ADD CONSTRAINT "MemoryProvenanceSubject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEventSubject" ADD CONSTRAINT "AuditEventSubject_auditEventId_fkey" FOREIGN KEY ("auditEventId") REFERENCES "AuditEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEventSubject" ADD CONSTRAINT "AuditEventSubject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRun" ADD CONSTRAINT "JobRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryExtractionRun" ADD CONSTRAINT "MemoryExtractionRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryExtractionRun" ADD CONSTRAINT "MemoryExtractionRun_sourceMessageId_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryCandidateApplication" ADD CONSTRAINT "MemoryCandidateApplication_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MemoryExtractionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingConsent" ADD CONSTRAINT "ProcessingConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PolicyAllowedCategories" ADD CONSTRAINT "_PolicyAllowedCategories_A_fkey" FOREIGN KEY ("A") REFERENCES "MemoryCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PolicyAllowedCategories" ADD CONSTRAINT "_PolicyAllowedCategories_B_fkey" FOREIGN KEY ("B") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PolicyDeniedCategories" ADD CONSTRAINT "_PolicyDeniedCategories_A_fkey" FOREIGN KEY ("A") REFERENCES "MemoryCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PolicyDeniedCategories" ADD CONSTRAINT "_PolicyDeniedCategories_B_fkey" FOREIGN KEY ("B") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MemoryCategories" ADD CONSTRAINT "_MemoryCategories_A_fkey" FOREIGN KEY ("A") REFERENCES "Memory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MemoryCategories" ADD CONSTRAINT "_MemoryCategories_B_fkey" FOREIGN KEY ("B") REFERENCES "MemoryCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Embedding_vector_hnsw_idx" ON "Embedding" USING hnsw ("vector" vector_cosine_ops);

-- Production installations need the taxonomy without creating demo accounts.
INSERT INTO "MemoryCategory" ("id", "key", "name", "description", "createdAt", "updatedAt") VALUES
('cat_communication_style', 'communication_style', 'Communication Style', 'How the user likes assistants to communicate.', NOW(), NOW()),
('cat_personal_preferences', 'personal_preferences', 'Personal Preferences', 'General personal tastes, likes, dislikes, and preferences.', NOW(), NOW()),
('cat_software_development', 'software_development', 'Software Development', 'Coding tools, languages, workflows, and preferences.', NOW(), NOW()),
('cat_project_context', 'project_context', 'Project Context', 'Context tied to active projects.', NOW(), NOW()),
('cat_privacy_preferences', 'privacy_preferences', 'Privacy Preferences', 'User preferences about storage, sharing, and disclosure.', NOW(), NOW()),
('cat_health', 'health', 'Health', 'Health-related memories that should be treated carefully.', NOW(), NOW()),
('cat_finance', 'finance', 'Finance', 'Financial memories that should be treated carefully.', NOW(), NOW()),
('cat_legal', 'legal', 'Legal', 'Legal memories that should be treated carefully.', NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;

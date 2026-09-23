# Database Schema

Funes Vault uses Postgres with Prisma. The canonical schema lives in `packages/db/prisma/schema.prisma`.

## Storage model

`pgvector` is included in the first database setup.

Reasons:

- Semantic retrieval is core to the product.
- The first embedding provider is OpenAI, whose common embedding dimensions can be stored directly in Postgres.
- Starting with a vector column avoids an early migration from JSON placeholder storage.

Local development uses the `pgvector/pgvector:pg17` Docker image.

## Core Tables

### `User`

Owns a memory vault. All user-owned tables should be scoped through `userId`.

Users also own their consolidation settings. Background consolidation is disabled by default, uses `REVIEW_ONLY` mode by default, and can be changed to `AUTO_APPLY` only by explicit user configuration.

### `Memory`

Canonical durable memory record. Includes kind, body, sensitivity, lifecycle status, review state, source metadata, optional expiration, consolidation cursor timestamps, and category relations.

The current memory delete flow is a soft delete that sets `status` to `DELETED` and records an audit event. Default memory list queries exclude deleted records unless explicitly filtered.

`updatedAt` is the generic Prisma row timestamp and can move for system-maintenance writes. Consolidation does not use it as the daily-change trigger. `consolidationRelevantAt` advances when user-facing memory content, categories, source details, review state, or expiration changes. `lastConsolidatedAt` records the memory version last inspected by consolidation. The daily worker uses these fields to avoid reviewing memories again just because a job touched the row.

### `MemoryProvenanceEntry`

Append-only lifecycle event for one memory. Each row is scoped by `userId`, points at a `memoryId`, and records the event type, actor type, optional actor ID, optional source type/client/URI, optional suggestion, job run, audit event, memory request, reason, confidence, evidence, and compact metadata.

Current provenance types include creation, import, suggestion application, source/content/status changes, archive/restore/delete, derivation, consolidation suggestion, and consolidation application.

### `MemoryProvenanceSubject`

Typed subject links for a provenance entry. Subjects can reference memories, suggestions, job runs, audit events, clients, policies, imports, memory requests, or providers. Subject roles describe how the subject relates to the event, such as target, source, canonical, superseded, derived output, suggestion, job, audit event, client, policy, import, request, provider, affected, archived, restored, deleted, disclosed, or denied.

Subject rows are also scoped by `userId` and store safe labels plus compact metadata. They intentionally avoid full memory body snapshots. A uniqueness constraint prevents duplicate `(provenanceEntryId, subjectType, subjectId, role)` links.

### `MemoryCategory`

Shared category definitions such as `communication_style`, `personal_preferences`, `software_development`, `project_context`, `privacy_preferences`, `health`, `finance`, and `legal`.

### `Client`

External app, MCP client, CLI, browser extension, local agent, or hosted integration that can request memory through scoped credentials.

Client API tokens are generated as opaque values and stored only as SHA-256 hashes. `tokenHash` is unique so bearer-token lookup cannot match multiple clients. Raw client tokens are shown only at creation or explicit rotation time.

### `GoogleIdentity`

Associates one Google subject (`sub`, unique) with one Funes user (`userId`, unique). Cascades on user deletion. Email is profile metadata, not an identity-linking key. Replaces the removed `PasswordCredential` table.

### `LoginAttempt`

Ten-minute, single-use sign-in state: hashed state and browser-binding token, expected nonce, PKCE verifier, allowlisted return path, optional session ID for deletion verification, and indexed expiry. Attempts are consumed atomically before provider exchange; expired rows are cleaned when starting login.

### `Session`

Stores hashed opaque session tokens for cookie-based authentication. Raw tokens are sent only to the browser as HTTP-only cookies. `deletionVerifiedAt` records an explicit Google identity check for that session and authorizes deletion for five minutes.

### `ChatSession`

User-owned memory chat transcript container. Chat sessions are persisted only once a message is accepted, so opening Chat or starting a local draft does not create an empty row. `title` stores an optional generated or user-provided thread title. `titleLocked` is `false` by default, allowing early automatic title generation, and is set to `true` when the user manually renames the thread. Automatic title updates must always scope by `userId` and `titleLocked = false`.

### `ChatMessage`

Persisted memory chat message. Stores role, content, structured citations, queued suggestion IDs, provider disclosure metadata, and creation time. Chat messages are application transcript data; they do not become durable memories unless the user approves a separate `MemorySuggestion`. Voice turns persist here too, marked by a `channel: "voice"` field inside the provider disclosure JSON.

### `VoiceSession`

Realtime voice session bookkeeping. Links a voice session to its owning user and the `ChatSession` its transcripts persist into, and records the Realtime model, start time, end time, and end reason (`user_ended`, `max_duration`, `idle_timeout`, `connection_lost`, `error`). The per-user daily session cap counts rows by `startedAt` within the current UTC day, and tool calls are refused once a session is ended or past its maximum duration.

### `OAuthClientRegistration`

Public OAuth application metadata: redirect allowlist, supported grant/auth methods, status and scopes. This registration is distinct from the owner-scoped `Client` grant created during consent. Registration alone grants no vault access.

### `OAuthAuthorizationRequest`

Expiring consent request with redirect URI, PKCE challenge, requested scopes/resource and a hashed CSRF token. `decidedAt` makes the consent decision single-use. It references registration metadata and does not itself contain a bearer credential.

### `OAuthAuthorizationCode`

Single-use code stored as a unique hash and bound to the owner, client grant, registration, redirect, PKCE challenge, scopes and resource. Expiry and atomic consumption prevent replay.

### `OAuthToken`

Hashed access or refresh credential bound to an owner and client grant. Expiry, revocation and source-code relationships support rotation and refresh-reuse rejection. Token plaintext is returned only at issuance, never exported with vault data.

### `Policy`

User-owned access rule for a client. Policies define purpose, operations, maximum sensitivity, confirmation behavior, allowed categories, and denied categories. A unique constraint on `(clientId, purpose)` allows at most one policy per client and purpose, matching the evaluator, which applies a single policy per declared purpose.

The first policy evaluator denies missing or blocked clients, ignores expired policies, applies sensitivity ceilings, and lets denied categories override allowed categories. An empty allowed-category list means the policy covers every category (matching the Apps & access UI); a non-empty list grants only the listed categories.

### `MemoryRequest`

Records a client request for memory. Tracks purpose, task, requested categories, token budget, retention declaration, downstream processors, status, and approval/fulfillment timestamps.

### `MemoryRequestItem`

Join table for memories included in a request bundle. Stores the disclosed text, sensitivity, category key, and relevance score for auditability.

Current memory bundle creation writes request items only after policy evaluation returns `ALLOW`; requests that require user confirmation do not create disclosed items.

### `MemorySuggestion`

Reviewable proposed memory from chat, clients, imports, or consolidation jobs. Suggestions are not active memories until approved. Suggestions can include an optional `expiresAt` timestamp; when the user approves the suggestion, that expiration is copied to the created memory.

Client-created suggestions are accepted only after `SUGGEST` or `WRITE` policy evaluation for the declared purpose, categories, and sensitivity. Accepted `SUGGEST` suggestions create a `MEMORY_SUGGESTION_CREATED` audit event and remain `QUEUED_FOR_REVIEW`. Accepted `WRITE` suggestions with `requiresConfirmation=false` create an active memory immediately and store the suggestion as `APPLIED`.

Consolidation suggestions use `sourceMetadata` to carry the proposed action, such as archiving an explicitly expired, duplicate, conflicting, or superseded memory. Applying an archive suggestion archives the target memory rather than creating a new duplicate memory record.

### `Embedding`

Stores one vector per memory/provider/model/content hash. The first vector column is `vector(1536)` for OpenAI embedding output.

Embedding rows are written by the API worker path through pgvector raw SQL because Prisma models the vector column as an unsupported native type. The content hash is derived from the prompt-ready memory text used for embedding.

### `AuditEvent`

Records important privacy and security events, especially memory disclosure, client changes, policy changes, memory changes, and job outcomes.

The memory CRUD API writes audit events for create, update, archive, and soft delete. Client and policy changes also write audit events. Memory bundle disclosures create `MEMORY_DISCLOSURE` audit events with request ID, client ID, policy ID, disclosed memory IDs, denied candidate reasons, and token estimates. Audit metadata stores identifiers and compact structured context without duplicating memory bodies.

Suggestion rejections create `MEMORY_SUGGESTION_REJECTED` events. Consolidation job creation, completion, failure, review-only suggestions, and auto-applied archive actions are audit-visible.

### `AuditEventSubject`

Typed subject links for an audit event. Audit subjects let the API and UI show affected memories, suggestions, jobs, requests, clients, and policies without scraping arbitrary JSON metadata. Rows are scoped by `userId`, carry a subject type, subject ID, role, optional safe label, compact metadata, and creation time.

The backfill migration creates subject rows from existing audit metadata keys such as `memoryId`, `memoryIds`, `denied`, `suggestionId`, `jobRunId`, `requestId`, `clientId`, `policyId`, `targetMemoryId`, and `canonicalMemoryId`.

### `JobRun`

Tracks async work such as embedding generation, import processing, explicit expiration handling, conflict detection, and consolidation. Job runs store compact metadata for queue names, BullMQ job IDs, result summaries, retries, and failure diagnostics.

### `MemoryExtractionRun`

One durable processing run per source chat message. Stores a configuration fingerprint, attempts, status, pending candidates and structured result. Claim tokens and leases prevent stale workers from committing; all use cases constrain the owning user.

### `MemoryCandidateApplication`

Idempotent candidate result, unique by `(runId, candidateId)`. Ownership comes through the extraction run. Retries consult existing outcomes rather than applying the same candidate twice.

### `ProcessingConsent`

Versioned owner permission for a processor and task scope, unique by `(userId, processor, scope)`. `revokedAt` records withdrawal. Provider execution and commit-time validation require current permission; importing a vault does not activate these permissions.

## Seed Data

`pnpm db:seed` creates:

- `demo@funes-vault.local`
- Standard memory categories.
- A local coding MCP client.
- Three sample memories.
- A software development policy.
- A fulfilled memory request with one disclosed memory.
- A queued memory suggestion.
- Provenance entries for seeded memories.
- Audit events and typed audit subjects for the seeded client, policy, suggestion, and disclosure.

The seed script resets records owned by the demo user before recreating them, while preserving shared category definitions.

## One-time disclosure approval

`MemoryRequest.reviewSnapshot` holds only the selected approved bundle and revision metadata until it is consumed or invalidated. `approvalExpiresAt` limits retrieval to 15 minutes after approval. The server revalidates client, policy, and memory state before disclosure. `MEMORY_REQUEST_APPROVED` and `MEMORY_REQUEST_DENIED` audit events record user decisions separately from `MEMORY_DISCLOSURE`.

## Configurable memory processing

## Entity relationship diagram

Generated from the Prisma schema with `pnpm docs:erd`.

<!-- ERD:START -->

```mermaid
erDiagram

        UserRole {
            USER USER
ADMIN ADMIN
OWNER OWNER
        }



        MemoryKind {
            FACT FACT
PREFERENCE PREFERENCE
INSTRUCTION INSTRUCTION
GOAL GOAL
PROJECT_CONTEXT PROJECT_CONTEXT
RELATIONSHIP RELATIONSHIP
CONSTRAINT CONSTRAINT
EVENT EVENT
SUMMARY SUMMARY
        }



        MemorySensitivity {
            PUBLIC PUBLIC
LOW LOW
INTERNAL INTERNAL
SENSITIVE SENSITIVE
RESTRICTED RESTRICTED
SECRET SECRET
        }



        MemoryStatus {
            SUGGESTED SUGGESTED
ACTIVE ACTIVE
ARCHIVED ARCHIVED
EXPIRED EXPIRED
DELETED DELETED
        }



        ReviewState {
            PENDING PENDING
APPROVED APPROVED
REJECTED REJECTED
        }



        SourceType {
            MANUAL MANUAL
IMPORT IMPORT
CHAT CHAT
CLIENT_SUGGESTION CLIENT_SUGGESTION
CONSOLIDATION CONSOLIDATION
API API
DERIVED DERIVED
        }



        ClientType {
            LOCAL_AGENT LOCAL_AGENT
MCP_CLIENT MCP_CLIENT
CLI CLI
WEB_APP WEB_APP
BROWSER_EXTENSION BROWSER_EXTENSION
HOSTED_APP HOSTED_APP
OTHER OTHER
        }



        ClientTrustLevel {
            UNKNOWN UNKNOWN
APPROVED APPROVED
BLOCKED BLOCKED
        }



        ClientRetention {
            NO_STORAGE NO_STORAGE
SESSION SESSION
PERSISTENT PERSISTENT
UNKNOWN UNKNOWN
        }



        PolicyOperation {
            READ READ
SUGGEST SUGGEST
WRITE WRITE
SUMMARIZE SUMMARIZE
EXPORT EXPORT
        }



        MemoryRequestStatus {
            PENDING PENDING
APPROVED APPROVED
NEEDS_USER_APPROVAL NEEDS_USER_APPROVAL
DENIED DENIED
FULFILLED FULFILLED
FAILED FAILED
        }



        MemorySuggestionStatus {
            QUEUED_FOR_REVIEW QUEUED_FOR_REVIEW
APPROVED APPROVED
REJECTED REJECTED
APPLIED APPLIED
DISMISSED DISMISSED
        }



        AuditEventType {
            MEMORY_PROCESSING_COMPLETED MEMORY_PROCESSING_COMPLETED
PROCESSING_CONSENT_UPDATED PROCESSING_CONSENT_UPDATED
MEMORY_CREATED MEMORY_CREATED
MEMORY_UPDATED MEMORY_UPDATED
MEMORY_ARCHIVED MEMORY_ARCHIVED
MEMORY_DELETED MEMORY_DELETED
MEMORY_DISCLOSURE MEMORY_DISCLOSURE
MEMORY_REQUEST_APPROVED MEMORY_REQUEST_APPROVED
MEMORY_REQUEST_DENIED MEMORY_REQUEST_DENIED
MEMORY_SUGGESTION_CREATED MEMORY_SUGGESTION_CREATED
MEMORY_SUGGESTION_APPROVED MEMORY_SUGGESTION_APPROVED
MEMORY_SUGGESTION_REJECTED MEMORY_SUGGESTION_REJECTED
CLIENT_CREATED CLIENT_CREATED
CLIENT_UPDATED CLIENT_UPDATED
CLIENT_TOKEN_ROTATED CLIENT_TOKEN_ROTATED
POLICY_CREATED POLICY_CREATED
POLICY_UPDATED POLICY_UPDATED
POLICY_DELETED POLICY_DELETED
OAUTH_GRANT_APPROVED OAUTH_GRANT_APPROVED
OAUTH_GRANT_DENIED OAUTH_GRANT_DENIED
OAUTH_TOKEN_ISSUED OAUTH_TOKEN_ISSUED
OAUTH_TOKEN_REVOKED OAUTH_TOKEN_REVOKED
JOB_CREATED JOB_CREATED
JOB_COMPLETED JOB_COMPLETED
JOB_FAILED JOB_FAILED
        }



        AuditActorType {
            USER USER
CLIENT CLIENT
SYSTEM SYSTEM
JOB JOB
        }



        MemoryProvenanceEntryType {
            CREATED CREATED
IMPORTED IMPORTED
SUGGESTED SUGGESTED
SOURCE_UPDATED SOURCE_UPDATED
CONTENT_UPDATED CONTENT_UPDATED
STATUS_CHANGED STATUS_CHANGED
ARCHIVED ARCHIVED
RESTORED RESTORED
DELETED DELETED
CONSOLIDATION_INSPECTED CONSOLIDATION_INSPECTED
CONSOLIDATION_SUGGESTED CONSOLIDATION_SUGGESTED
CONSOLIDATION_APPLIED CONSOLIDATION_APPLIED
DERIVED DERIVED
        }



        ProvenanceSubjectType {
            MEMORY MEMORY
MEMORY_SUGGESTION MEMORY_SUGGESTION
JOB_RUN JOB_RUN
AUDIT_EVENT AUDIT_EVENT
MEMORY_REQUEST MEMORY_REQUEST
CLIENT CLIENT
POLICY POLICY
IMPORT IMPORT
PROVIDER PROVIDER
        }



        ProvenanceSubjectRole {
            TARGET TARGET
SOURCE SOURCE
CANONICAL CANONICAL
SUPERSEDED_BY SUPERSEDED_BY
DUPLICATE_OF DUPLICATE_OF
CONFLICTS_WITH CONFLICTS_WITH
DERIVED_FROM DERIVED_FROM
DERIVED_OUTPUT DERIVED_OUTPUT
SUGGESTION SUGGESTION
JOB JOB
AUDIT_EVENT AUDIT_EVENT
REQUEST REQUEST
CLIENT CLIENT
POLICY POLICY
IMPORT_SOURCE IMPORT_SOURCE
MODEL_PROVIDER MODEL_PROVIDER
        }



        AuditSubjectType {
            MEMORY MEMORY
MEMORY_SUGGESTION MEMORY_SUGGESTION
JOB_RUN JOB_RUN
MEMORY_REQUEST MEMORY_REQUEST
CLIENT CLIENT
POLICY POLICY
IMPORT IMPORT
EXPORT EXPORT
        }



        AuditSubjectRole {
            TARGET TARGET
SOURCE SOURCE
CANONICAL CANONICAL
DISCLOSED DISCLOSED
DENIED DENIED
CREATED CREATED
UPDATED UPDATED
ARCHIVED ARCHIVED
DELETED DELETED
SUGGESTION SUGGESTION
JOB JOB
REQUEST REQUEST
CLIENT CLIENT
POLICY POLICY
IMPORTED IMPORTED
EXPORTED EXPORTED
        }



        JobType {
            GENERATE_EMBEDDING GENERATE_EMBEDDING
PROCESS_IMPORT PROCESS_IMPORT
CONSOLIDATE_MEMORIES CONSOLIDATE_MEMORIES
DETECT_CONFLICTS DETECT_CONFLICTS
SEND_REVIEW_REMINDER SEND_REVIEW_REMINDER
        }



        JobStatus {
            QUEUED QUEUED
RUNNING RUNNING
SUCCEEDED SUCCEEDED
FAILED FAILED
CANCELLED CANCELLED
        }



        ConsolidationMode {
            REVIEW_ONLY REVIEW_ONLY
AUTO_APPLY AUTO_APPLY
        }



        ChatMessageRole {
            USER USER
ASSISTANT ASSISTANT
        }



        OAuthRegistrationStatus {
            PENDING PENDING
APPROVED APPROVED
BLOCKED BLOCKED
        }



        OAuthTokenType {
            ACCESS ACCESS
REFRESH REFRESH
        }



        MemoryExtractionRunStatus {
            PENDING pending
RUNNING running
COMPLETED completed
PARTIAL partial
SKIPPED skipped
FAILED failed
        }

  "User" {
    String id "PK"
    String email
    String displayName "nullable"
    UserRole role
    Boolean consolidationEnabled
    ConsolidationMode consolidationMode
    DateTime createdAt
    DateTime updatedAt
    }


  "ChatSession" {
    String id "PK"
    String userId
    String title "nullable"
    Boolean titleLocked
    DateTime createdAt
    DateTime updatedAt
    }


  "VoiceSession" {
    String id "PK"
    String userId
    String chatSessionId
    String model
    DateTime startedAt
    DateTime endedAt "nullable"
    String endReason "nullable"
    String extractionFingerprint "nullable"
    }


  "ChatMessage" {
    String id "PK"
    String sessionId
    String userId
    ChatMessageRole role
    String content
    String sourceTimezone "nullable"
    String submissionId "nullable"
    String voiceSessionId "nullable"
    String voiceItemId "nullable"
    Json processing
    Json citations
    String suggestedMemoryIds
    Json provider
    DateTime createdAt
    }


  "GoogleIdentity" {
    String id "PK"
    String subject
    String userId
    }


  "LoginAttempt" {
    String stateHash "PK"
    String browserHash
    String nonce
    String codeVerifier
    String returnTo
    String sessionId "nullable"
    DateTime expiresAt
    }


  "Session" {
    DateTime deletionVerifiedAt "nullable"
    String id "PK"
    String userId
    String tokenHash
    DateTime expiresAt
    DateTime createdAt
    DateTime updatedAt
    }


  "MemoryCategory" {
    String id "PK"
    String key
    String name
    String description "nullable"
    DateTime createdAt
    DateTime updatedAt
    }


  "Memory" {
    String id "PK"
    String userId
    MemoryKind kind
    String title
    String body
    MemorySensitivity sensitivity
    Float confidence
    MemoryStatus status
    ReviewState reviewState
    SourceType sourceType
    String sourceClientId "nullable"
    String sourceUri "nullable"
    Json sourceMetadata
    DateTime lastConfirmedAt "nullable"
    DateTime expiresAt "nullable"
    DateTime consolidationRelevantAt
    DateTime lastConsolidatedAt "nullable"
    DateTime semanticInspectedAt "nullable"
    DateTime createdAt
    DateTime updatedAt
    }


  "Client" {
    String id "PK"
    String userId
    String name
    ClientType type
    ClientTrustLevel trustLevel
    ClientRetention declaredRetention
    String tokenHash "nullable"
    String oauthRegistrationId "nullable"
    DateTime lastUsedAt "nullable"
    DateTime createdAt
    DateTime updatedAt
    }


  "OAuthClientRegistration" {
    String id "PK"
    String clientId
    String name
    String redirectUris
    String tokenEndpointAuthMethod
    String grantTypes
    String scope "nullable"
    String clientUri "nullable"
    String logoUri "nullable"
    String contacts
    OAuthRegistrationStatus status
    Json metadata
    DateTime createdAt
    DateTime updatedAt
    }


  "OAuthAuthorizationRequest" {
    String id "PK"
    String registrationId
    String redirectUri
    String codeChallenge
    String scopes
    String state "nullable"
    String resource "nullable"
    String csrfTokenHash
    DateTime expiresAt
    DateTime decidedAt "nullable"
    DateTime createdAt
    }


  "OAuthAuthorizationCode" {
    String id "PK"
    String registrationId
    String userId
    String clientId
    String codeHash
    String redirectUri
    String codeChallenge
    String scopes
    String resource "nullable"
    DateTime expiresAt
    DateTime consumedAt "nullable"
    DateTime createdAt
    }


  "OAuthToken" {
    String id "PK"
    String registrationId
    String userId
    String clientId
    OAuthTokenType type
    String tokenHash
    String scopes
    String resource "nullable"
    String sourceCodeId "nullable"
    DateTime expiresAt
    DateTime revokedAt "nullable"
    DateTime createdAt
    }


  "Policy" {
    String id "PK"
    String userId
    String clientId
    String purpose
    MemorySensitivity maxSensitivity
    PolicyOperation operations
    Boolean requiresConfirmation
    DateTime expiresAt "nullable"
    DateTime createdAt
    DateTime updatedAt
    }


  "MemoryRequest" {
    String id "PK"
    String userId
    String clientId
    String purpose
    String task
    MemoryRequestStatus status
    Int tokenBudget
    String requestedCategories
    ClientRetention retention
    String thirdPartyProcessors
    Json reviewSnapshot
    DateTime approvalExpiresAt "nullable"
    DateTime approvedAt "nullable"
    DateTime deniedAt "nullable"
    DateTime fulfilledAt "nullable"
    DateTime createdAt
    DateTime updatedAt
    }


  "MemoryRequestItem" {
    String id "PK"
    String memoryRequestId
    String memoryId
    String text
    String categoryKey "nullable"
    MemorySensitivity sensitivity
    Float relevanceScore "nullable"
    DateTime createdAt
    }


  "MemorySuggestion" {
    String id "PK"
    String userId
    SourceType sourceType
    String sourceClientId "nullable"
    String title
    String body
    MemoryKind suggestedKind
    MemorySensitivity suggestedSensitivity
    String suggestedCategories
    String evidence "nullable"
    Json sourceMetadata
    Float confidence
    MemorySuggestionStatus status
    DateTime expiresAt "nullable"
    DateTime createdAt
    DateTime updatedAt
    }


  "Embedding" {
    String id "PK"
    String userId
    String memoryId
    String provider
    String model
    String contentHash
    DateTime createdAt
    DateTime updatedAt
    }


  "AuditEvent" {
    String id "PK"
    String userId
    String clientId "nullable"
    String memoryRequestId "nullable"
    AuditEventType type
    AuditActorType actorType
    String actorId "nullable"
    Json metadata
    DateTime createdAt
    }


  "MemoryProvenanceEntry" {
    String id "PK"
    String userId
    String memoryId
    MemoryProvenanceEntryType type
    AuditActorType actorType
    String actorId "nullable"
    SourceType sourceType "nullable"
    String sourceClientId "nullable"
    String sourceUri "nullable"
    String suggestionId "nullable"
    String jobRunId "nullable"
    String auditEventId "nullable"
    String memoryRequestId "nullable"
    String reason "nullable"
    String evidence "nullable"
    Float confidence "nullable"
    Json metadata
    DateTime createdAt
    }


  "MemoryProvenanceSubject" {
    String id "PK"
    String userId
    String provenanceEntryId
    ProvenanceSubjectType subjectType
    String subjectId
    ProvenanceSubjectRole role
    String labelSnapshot "nullable"
    Json metadata
    DateTime createdAt
    }


  "AuditEventSubject" {
    String id "PK"
    String userId
    String auditEventId
    AuditSubjectType subjectType
    String subjectId
    AuditSubjectRole role
    String labelSnapshot "nullable"
    Json metadata
    DateTime createdAt
    }


  "JobRun" {
    String id "PK"
    String userId "nullable"
    JobType type
    JobStatus status
    Int attempts
    Int maxAttempts
    Json metadata
    String error "nullable"
    DateTime startedAt "nullable"
    DateTime finishedAt "nullable"
    DateTime createdAt
    DateTime updatedAt
    }


  "MemoryExtractionRun" {
    String id "PK"
    String userId
    String sourceMessageId
    Json configuration
    String fingerprint
    MemoryExtractionRunStatus status
    Int attempts
    String claimToken "nullable"
    DateTime leaseUntil "nullable"
    Json result
    Json pendingCandidates
    String failureReason "nullable"
    DateTime createdAt
    DateTime updatedAt
    DateTime finishedAt "nullable"
    }


  "MemoryCandidateApplication" {
    String id "PK"
    String runId
    String candidateId
    Json result
    DateTime createdAt
    }


  "ProcessingConsent" {
    String id "PK"
    String userId
    String processor
    String scope
    Int version
    DateTime grantedAt
    DateTime revokedAt "nullable"
    }

    "User" |o--|| "UserRole" : "enum:role"
    "User" |o--|| "ConsolidationMode" : "enum:consolidationMode"
    "ChatSession" }o--|| "User" : "user"
    "VoiceSession" }o--|| "ChatSession" : "chatSession"
    "VoiceSession" }o--|| "User" : "user"
    "ChatMessage" |o--|| "ChatMessageRole" : "enum:role"
    "ChatMessage" }o--|| "ChatSession" : "session"
    "ChatMessage" }o--|| "User" : "user"
    "GoogleIdentity" |o--|| "User" : "user"
    "Session" }o--|| "User" : "user"
    "MemoryCategory" o{--}o "Policy" : ""
    "MemoryCategory" o{--}o "Policy" : ""
    "MemoryCategory" o{--}o "Memory" : ""
    "Memory" |o--|| "MemoryKind" : "enum:kind"
    "Memory" |o--|| "MemorySensitivity" : "enum:sensitivity"
    "Memory" |o--|| "MemoryStatus" : "enum:status"
    "Memory" |o--|| "ReviewState" : "enum:reviewState"
    "Memory" |o--|| "SourceType" : "enum:sourceType"
    "Memory" }o--|o "Client" : "sourceClient"
    "Memory" }o--|| "User" : "user"
    "Client" |o--|| "ClientType" : "enum:type"
    "Client" |o--|| "ClientTrustLevel" : "enum:trustLevel"
    "Client" |o--|| "ClientRetention" : "enum:declaredRetention"
    "Client" }o--|o "OAuthClientRegistration" : "oauthRegistration"
    "Client" }o--|| "User" : "user"
    "OAuthClientRegistration" |o--|| "OAuthRegistrationStatus" : "enum:status"
    "OAuthAuthorizationRequest" }o--|| "OAuthClientRegistration" : "registration"
    "OAuthAuthorizationCode" }o--|| "Client" : "client"
    "OAuthAuthorizationCode" }o--|| "OAuthClientRegistration" : "registration"
    "OAuthAuthorizationCode" }o--|| "User" : "user"
    "OAuthToken" |o--|| "OAuthTokenType" : "enum:type"
    "OAuthToken" }o--|| "Client" : "client"
    "OAuthToken" }o--|| "OAuthClientRegistration" : "registration"
    "OAuthToken" }o--|| "User" : "user"
    "Policy" |o--|| "MemorySensitivity" : "enum:maxSensitivity"
    "Policy" |o--}o "PolicyOperation" : "enum:operations"
    "Policy" }o--|| "Client" : "client"
    "Policy" }o--|| "User" : "user"
    "MemoryRequest" |o--|| "MemoryRequestStatus" : "enum:status"
    "MemoryRequest" |o--|| "ClientRetention" : "enum:retention"
    "MemoryRequest" }o--|| "Client" : "client"
    "MemoryRequest" }o--|| "User" : "user"
    "MemoryRequestItem" |o--|| "MemorySensitivity" : "enum:sensitivity"
    "MemoryRequestItem" }o--|| "Memory" : "memory"
    "MemoryRequestItem" }o--|| "MemoryRequest" : "memoryRequest"
    "MemorySuggestion" |o--|| "SourceType" : "enum:sourceType"
    "MemorySuggestion" |o--|| "MemoryKind" : "enum:suggestedKind"
    "MemorySuggestion" |o--|| "MemorySensitivity" : "enum:suggestedSensitivity"
    "MemorySuggestion" |o--|| "MemorySuggestionStatus" : "enum:status"
    "MemorySuggestion" }o--|o "Client" : "sourceClient"
    "MemorySuggestion" }o--|| "User" : "user"
    "Embedding" }o--|| "Memory" : "memory"
    "Embedding" }o--|| "User" : "user"
    "AuditEvent" |o--|| "AuditEventType" : "enum:type"
    "AuditEvent" |o--|| "AuditActorType" : "enum:actorType"
    "AuditEvent" }o--|o "Client" : "client"
    "AuditEvent" }o--|o "MemoryRequest" : "memoryRequest"
    "AuditEvent" }o--|| "User" : "user"
    "MemoryProvenanceEntry" |o--|| "MemoryProvenanceEntryType" : "enum:type"
    "MemoryProvenanceEntry" |o--|| "AuditActorType" : "enum:actorType"
    "MemoryProvenanceEntry" |o--|o "SourceType" : "enum:sourceType"
    "MemoryProvenanceEntry" }o--|| "Memory" : "memory"
    "MemoryProvenanceEntry" }o--|| "User" : "user"
    "MemoryProvenanceSubject" |o--|| "ProvenanceSubjectType" : "enum:subjectType"
    "MemoryProvenanceSubject" |o--|| "ProvenanceSubjectRole" : "enum:role"
    "MemoryProvenanceSubject" }o--|| "MemoryProvenanceEntry" : "provenanceEntry"
    "MemoryProvenanceSubject" }o--|| "User" : "user"
    "AuditEventSubject" |o--|| "AuditSubjectType" : "enum:subjectType"
    "AuditEventSubject" |o--|| "AuditSubjectRole" : "enum:role"
    "AuditEventSubject" }o--|| "AuditEvent" : "auditEvent"
    "AuditEventSubject" }o--|| "User" : "user"
    "JobRun" |o--|| "JobType" : "enum:type"
    "JobRun" |o--|| "JobStatus" : "enum:status"
    "JobRun" }o--|o "User" : "user"
    "MemoryExtractionRun" |o--|| "MemoryExtractionRunStatus" : "enum:status"
    "MemoryExtractionRun" }o--|| "User" : "user"
    "MemoryExtractionRun" |o--|| "ChatMessage" : "source"
    "MemoryCandidateApplication" }o--|| "MemoryExtractionRun" : "run"
    "ProcessingConsent" }o--|| "User" : "user"
```

<!-- ERD:END -->

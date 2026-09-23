# Memory Model

## Definition

A memory is a durable, user-inspectable unit of information that may help an AI system understand or assist the user in the future.

Memories are not just chat history. They are curated facts, preferences, constraints, goals, relationships, project context, and behavioral instructions with provenance and policy metadata.

## Memory Record

The API response uses this shape (category arrays are empty when none are assigned):

```json
{
  "id": "memory_example",
  "kind": "PREFERENCE",
  "title": "Prefer concise technical answers",
  "body": "Prefer concise, direct explanations with concrete examples.",
  "categories": [],
  "categoryKeys": [],
  "sensitivity": "LOW",
  "confidence": 0.86,
  "source": { "type": "MANUAL", "clientId": null, "uri": null, "metadata": {} },
  "status": "ACTIVE",
  "reviewState": "APPROVED",
  "createdAt": "2026-09-22T00:00:00.000Z",
  "updatedAt": "2026-09-22T00:00:00.000Z",
  "expiresAt": null,
  "lastConfirmedAt": null
}
```

## Memory Kinds

- Fact: stable information about the user.
- Preference: how the user likes things done.
- Instruction: explicit guidance for assistants.
- Goal: something the user is trying to achieve.
- Project context: information scoped to a project or workspace.
- Relationship: information about people or organizations relevant to the user.
- Constraint: limits such as budget, schedule, location, ability, policy, or tooling.
- Event: dated information that may have explicit time bounds.
- Summary: derived context from multiple memories or sources.

## Sensitivity Levels

The ordered labels below express handling intent; actual disclosure is governed by the client policy and confirmation rules:

- public: safe to share broadly.
- low: ordinary personalization.
- internal: contextual information that should be limited to trusted clients.
- sensitive: personal information deserving a narrow grant.
- restricted: highly private context; prefer per-request approval.
- secret: highest sensitivity label. Credential-like content is blocked independently of this label.

## Lifecycle States

`Memory.status` is `ACTIVE`, `ARCHIVED`, `EXPIRED` or `DELETED`. Retrieval also requires `reviewState: APPROVED` and an expiration date in the future or no expiration date. Suggestions live separately with `QUEUED_FOR_REVIEW`, `APPLIED` or `REJECTED` status; they are not a memory lifecycle state.

## Provenance

Every memory keeps a compact current `source` summary and an append-only provenance timeline. The source summary is convenient for lists and details; the provenance timeline is the durable history for origin, review, imports, updates, consolidation, and deletion.

Implemented provenance sources include:

- Manual user entry.
- Imported document.
- Chat transcript.
- Client suggestion.
- Derived summary.
- API write.

Provenance helps the user judge trust, correct mistakes, and understand why a memory exists.

Current implementation note: `MemoryProvenanceEntry` records one lifecycle event for one memory, scoped by `userId`. Each entry stores actor type, optional actor ID, source type, suggestion/job/audit/request references, reason, confidence, evidence, and compact metadata. `MemoryProvenanceSubject` attaches typed links to related memories, suggestions, jobs, audit events, clients, policies, imports, requests, and providers. These subject rows carry safe labels and IDs rather than duplicating full memory bodies. The Vault detail UI reads this timeline through `GET /v1/memories/:id/provenance`.

## Retrieval Pipeline

1. Authenticate the client and read purpose, task, categories and token budget.
2. Retrieve owner-scoped active, approved, unexpired keyword and vector candidates.
3. Rank by weighted keyword overlap (0.45) and vector similarity (0.55), with a keyword-match boost (0.45). Keyword candidates are bounded and read newest first; there is no user pinning or workspace filter.
4. Apply the client's purpose, category, sensitivity, operation and confirmation policy.
5. Compile allowed items within the token budget and audit each disclosure. Approval-gated requests return no items until the selected preview is approved and consumed once.

## Memory Bundle

A memory bundle is the disclosure unit sent to a client. It should be distinct from raw database records.

The HTTP bundle uses camelCase fields:

```json
{
  "requestId": "request_example",
  "status": "FULFILLED",
  "policyId": "policy_example",
  "tokenBudget": 1200,
  "estimatedTokens": 12,
  "items": [
    {
      "memoryId": "memory_example",
      "text": "Prefers concise answers.",
      "category": "communication_style",
      "sensitivity": "LOW",
      "estimatedTokens": 12,
      "relevanceScore": 0.9
    }
  ],
  "instructions": [],
  "denied": [],
  "auditEventId": "audit_example"
}
```

## Derived Memories

Derived memories are summaries or inferences created from source material. They need special care:

- They should link to source memory IDs.
- They should carry at least the maximum sensitivity of their sources.
- They should record whether they are factual, inferred, or model-generated.
- They should be easy to review and reject.
- They should be invalidated or recomputed if source memories are deleted.

## Guided Memory Creation

The product helps users create useful first memories through a guided question flow and an in-app memory chat.

Potential prompt areas:

- How the user likes assistants to communicate.
- Professional context and current projects.
- Tools, languages, and workflows the user prefers.
- Privacy preferences and no-go topics.
- Personal constraints that commonly matter for assistance.
- Long-term goals.

Answers should create memory suggestions first. The user should approve or edit them before they become durable memories.

## Consolidation And "Dreaming"

Funes Vault can run a daily or periodic background process that reviews memories and proposes improvements. This process can be thought of as consolidation or "dreaming."

Candidate behaviors:

- Find duplicate memories.
- Detect explicitly expired memories.
- Detect conflicts.
- Suggest clearer summaries.
- Suggest expiration dates.
- Group related memories.
- Identify gaps that could be filled by guided questions.

Important constraint: the default version should not silently rewrite durable memories. Consolidation is disabled and `REVIEW_ONLY` by default, producing reviewable suggestions with provenance. If the user explicitly configures `AUTO_APPLY`, every current consolidation output is applied automatically and each archive action creates both an audit event and a provenance entry linked to the job run, audit event, target memory, and canonical memory where applicable.

## Expiration And Relevance

Funes maintains internal consistency, but it does not forget by age. Recency may influence relevance ranking and consolidation candidate discovery, but it is not a retention rule.

Personal context changes. Funes Vault should support:

- Explicit expiration dates.
- Review reminders.
- Last-confirmed timestamps.
- Conflict detection.
- "Ask me again later" flows.
- Background consolidation suggestions.

## Conflict Handling

Conflicting memories should not silently collapse into one answer. The system should preserve both and expose uncertainty:

- "User used to prefer X, but newer memory says Y."
- "This memory has not been confirmed in 18 months."
- "Two imported sources disagree."

Current implementation note: consolidation suggestions and auto-applied archive actions classify candidate reasons as explicit expiration, exact duplicate, semantic duplicate, conflict, or superseded memory. Suggestion cards and job details expose target/canonical memory links, evidence, confidence, mode, and job references so the user can inspect the action before or after it changes a memory.

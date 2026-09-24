# 0044 — App permissions and stated purpose

Date: 2026-09-24

Status: accepted

## Context and problem

Free-form task reasons selected exact policy keys, coupling audit context to authority and hiding usable permissions from connected apps.

## Decision outcome

Each authenticated client has at most one Policy. Purpose is optional, nullable caller-declared audit context only; task continues to drive retrieval. App permissions alone grant operations and memory ceilings. No policy grants no access. OAuth scopes remain a separate route ceiling; WRITE has no new scope and permits immediate application only when the policy allows it.

Retain Policy.userId with a composite foreign key to Client(id, userId), enforcing owner equality in the database. Policy.updatedAt is its version. Requests bind the policy id and version, with deletion permanently orphaning old requests. Revalidation protects previews and single-use consumption.

Suggestion metadata uses server-owned top-level dispatch keys and a nested caller object. Archive dispatch also requires CONSOLIDATION source.

Ship one additive migration after the public baseline. Keep the most recently updated policy per client, breaking ties by id; discard surplus policies and remove purpose from Policy. Exports become v2 with no v1 compatibility. Client, session and OAuth identities survive.

## Consequences

Deploy the migration before API, MCP and web together. Consent explicitly shows resulting permissions; refresh and ordinary first-party use never restore removed permissions. Owners can restore first-party defaults on the existing client. MCP exposes strict camelCase schemas with uppercase enum values and rejects unknown keys; direct HTTP inputs retain their aliases. Each tool makes exactly one API call.

The owner-scoped voice steward sensitivity bypass remains a separate follow-up; voice queues proposals by default because its default app permissions omit WRITE. Owners may grant WRITE through App permissions, with the same sensitivity and confirmation limits as other clients. The explicit extraction review mode remains review-only for every channel.

The shared `MemoryRequestReason` enum deliberately covers both request-level and per-memory denial diagnostics so audit, HTTP, MCP and UI can use one vocabulary. Request-level evaluators emit only the request subset, while `denied[].reason` records a memory-level rule; this is enforced by evaluator tests rather than separate wire enums.

# Privacy and trust model

Funes Vault gives the owner control over stored context and future disclosure.
It is **server-readable**, not end-to-end encrypted. The operator, a compromised
server, or someone with database/backup access can read memories and transcripts.
Choose the deployment and provider settings accordingly.

## Principles

1. Every private record belongs to an owner; client access is a separate grant.
2. A request's task text cannot override trust, operation, category or sensitivity rules.
3. Approval shows the exact eligible text and permits a selected, single-use result.
4. Writes, grants and disclosures leave an inspectable audit/provenance trail.
5. Third-party processing is visible and bounded by the applicable permission.
6. Owners can correct, archive, export and delete data, and revoke future access.

## Guarantees and evidence

| Guarantee                                                                           | Mechanism                                                                           | Tests                                                                                                                                 |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Another user cannot read or mutate an owned record                                  | Owner-scoped queries and relation checks, including subjects and extraction sources | [Tenant isolation](../apps/api/test/tenant-isolation.e2e.spec.ts)                                                                     |
| A blocked or ungranted client cannot bypass policy through request text             | Bearer identity, app permissions, deny precedence, operation and sensitivity checks | [Policy evaluator](../apps/api/src/policies/policy-evaluation.service.spec.ts)                                                        |
| One-time approval discloses only selected text                                      | Revision snapshot, locked revalidation and client-bound single-use consumption      | [Disclosure review](../apps/api/test/disclosure-review.e2e.spec.ts)                                                                   |
| Revocation and expiry affect future access                                          | Live client/policy checks at retrieval and token validation                         | [OAuth integration](../apps/api/test/oauth.e2e.spec.ts), [disclosure review](../apps/api/test/disclosure-review.e2e.spec.ts)          |
| Secret-like values do not become durable memories through ordinary writes           | Shared secret detection before create, update, capture and candidate application    | [Memory integration](../apps/api/test/memories.e2e.spec.ts), [processing integration](../apps/api/test/memory-processing.e2e.spec.ts) |
| Expired claims and revoked processing permission cannot commit late provider output | Run leases, owner/run locks and commit-time consent/configuration checks            | [Processing integration](../apps/api/test/memory-processing.e2e.spec.ts)                                                              |
| Imported data does not copy usable credentials or activate processor permission     | Explicit import/export field maps, owner remapping and review defaults              | [Data-control round trips](../apps/api/test/data-control.e2e.spec.ts)                                                                 |
| The queue dashboard requires an administrative owner role                           | Shared session resolution and `ADMIN`/`OWNER` role check                            | [Dashboard middleware](../apps/api/src/jobs/queue-dashboard-auth.spec.ts)                                                             |
| Changing owners removes private browser query data                                  | Cache cancellation/removal and session replacement                                  | [Session boundary](../apps/web/src/shell/use-session.test.tsx)                                                                        |
| Cached shell resources do not include API responses                                 | Service-worker route filtering and versioned shell caches                           | [PWA tests](../apps/web/src/features/pwa/pwa.test.ts)                                                                                 |

Tests establish these application behaviors under their fixtures; they are not a
penetration test or a guarantee against a compromised host or downstream client.

## Identity and disclosure

Production website identity uses Google OpenID Connect and revocable opaque
session cookies. Funes stores the Google subject and profile identity, not Google
access/refresh tokens. It never silently links vaults by matching email. Account
deletion requires a fresh same-subject Google round trip bound to the current
session, followed by explicit confirmation. Google can reuse its existing login;
this is not enforced password or MFA reauthentication.

External tools use registered clients with static bearer tokens or OAuth grants.
Each app has at most one permission set. Policies allow operations and constrain categories, sensitivity,
expiry and confirmation. Unknown and blocked clients fail closed. Declared client
retention is information for the owner's decision; Funes cannot verify how a
recipient stores an already disclosed bundle.

An approval-gated request returns no memory bodies before review. The owner sees
eligible text, excludes unwanted memories and approves once or denies. Revalidation
can reject stale previews after a policy or memory changes. Client revocation does
not erase text already received by the client.

## Processing boundaries

OpenAI handles the configured chat, embedding and Realtime voice functions.
Embeddings default to allowing all stored sensitivity levels; lower
`EMBEDDINGS_MAX_SENSITIVITY` to exclude classes from provider embedding. Secret-like
content rejection still applies before storage, but it is pattern-based and cannot
recognize every possible secret.

Conversational extraction and semantic consolidation select providers independently.
The optional TypeSafe Jev memory classifier is activated by the task's provider
selection, initially determined by server configuration and subsequently controlled
by the owner. System 1 extraction also sends selected passages to OpenAI normalization;
System 2 uses the OpenAI LLM pipeline. See [memory processing](memory-processing.md)
for the exact boundaries. Provider choice does not weaken write policy or review
mode. No automatic provider fallback occurs.

Voice sends live microphone audio and retrieved memory text to OpenAI Realtime.
The browser receives an ephemeral credential, not the long-lived provider key.
New voice memory proposals are reviewed under the first-party voice grant; explicit
correction tools can update/archive owned memories. Do not interpret suggestion
review as universal review-before-every-write.

## Storage and device state

The server stores memory bodies, transcripts, processing candidates and operational
metadata. Audit and provenance rows use identifiers, safe labels and compact
metadata rather than full body snapshots. Opaque session/client/OAuth credentials
are hashed. Google login attempts briefly retain a plaintext PKCE verifier because
exchange requires it; expiry and cleanup bound its lifetime.

The PWA stores its shell and explicit offline captures on the device. It remembers only the last verified owner ID per API URL to reopen that owner’s queue on a cold offline start. This hint grants no server access and is cleared on sign-out or session expiration. Sync verifies that the authenticated owner matches the queue owner. Pending
captures are device-local and can be exposed by device compromise or shared browser
access. They are not a complete offline vault. Exported JSON and database backups
contain sensitive context; protect them as carefully as the live database.

TLS, disk/backup encryption, host access, retention, secret management and recovery
are operator responsibilities. See the [threat model](threat-model.md) for residual
risks and the [operations guide](deployment-and-operations.md) for deployment.

# HTTP API guide

The [checked-in OpenAPI document](openapi.json) describes the Nest HTTP routes,
request DTOs and responses. A running API exposes the same document at
`/openapi.json` and an interactive viewer at `/docs`. Shared Zod schemas in
`packages/shared/src` are the runtime validation contracts.

## Origins and versioning

Local development uses `http://localhost:4000` for API and `http://localhost:3000`
for web. Production uses separate web, API and connector HTTPS origins; see the
[deployment route map](deployment-and-operations.md). Resource endpoints use `/v1`.
Authentication, health, OpenAPI and OAuth discovery have unversioned paths.

The connector origin exposes only MCP and the required OAuth/consent routes. It
is not a public proxy for every API or operator endpoint.

## Authentication boundaries

| Consumer                 | Credential                                       | Authority                                                |
| ------------------------ | ------------------------------------------------ | -------------------------------------------------------- |
| Browser owner            | `funes_vault_session` HTTP-only cookie           | Owner-scoped administration of the vault                 |
| Registered static client | `Authorization: Bearer <token>`                  | Client's current trust and app operation permissions     |
| OAuth connector          | Opaque OAuth access token                        | Owner-approved client grant, scopes, resource and policy |
| Queue administrator      | Valid owner session with `ADMIN` or `OWNER` role | Optional `/admin/queues` dashboard                       |

Browser sessions are established through `/auth/google` and the configured
Google callback. `/auth/me` returns the signed-in owner; logout revokes the session.
Cross-origin browser requests must include credentials and originate from the
configured web origin. Cookies are secure on HTTPS deployments. Demo login is
available only in development with the seeded, unlinked demo account.

Creating or rotating a static client token shows its plaintext once. Store it in
the calling tool's secret configuration. Client and session tokens are stored as
hashes. Never put credentials in URLs, logs, issue reports or vault exports.

Client credentials cannot call owner administration endpoints. Purpose is optional caller-declared audit context and never selects or overrides permissions. Unknown and blocked clients fail closed.

## OAuth and MCP discovery

OAuth protocol routes come from the MCP SDK rather than Nest controllers, so they
are **not included** in the Nest OpenAPI document. Discover the authorization
server and protected resource rather than constructing protocol requests from
Swagger DTOs:

- `/.well-known/oauth-authorization-server`
- `/.well-known/oauth-protected-resource` (and the resource-specific metadata)
- `/register`, `/authorize`, `/token`, `/revoke`

The authorization-code flow uses PKCE, exact registered redirect URIs, expiring
single-use codes and owner consent. Refresh credentials rotate; reuse invalidates
the affected grant's token family. See [MCP integration](mcp-integration.md) for
client configuration and [architecture](../ARCHITECTURE.md) for the sequence.

## Memory disclosure

An external client requests context through `POST /v1/memory-requests`:

```json
{
  "purpose": "Plan the next garden-planner feature",
  "task": "Help me plan the next accessible garden-planner feature",
  "requestedCategories": ["communication_style", "project_context"],
  "retention": "NO_STORAGE",
  "thirdPartyProcessors": [],
  "tokenBudget": 1200
}
```

The server authenticates the client, checks app authority before retrieval, then evaluates eligible candidates.
The response includes `requestId`, `status`, `reason`, `items`, `denied`, token accounting,
instructions and the relevant audit reference. A transport success does not imply
permission: inspect the response status. `NEEDS_USER_APPROVAL` contains no
approved memory bodies yet. Declared retention informs the owner's decision; the
server cannot enforce downstream deletion after delivery.

For an approval-gated request:

1. Send the owner to `/settings/requests?requestId=<id>` in the web app.
2. The owner loads `GET /v1/memory-request-reviews/:id` using their session.
3. The preview contains exact eligible text and a `revision` token.
4. Submit selected IDs and that revision to `PATCH /v1/memory-request-reviews/:id`.
5. The original client calls `GET /v1/memory-requests/:id/result` once after approval.

Approval input:

```json
{
  "action": "approve",
  "revision": "<revision from the current preview>",
  "memoryIds": ["<selected memory id>"]
}
```

Denial input is `{ "action": "deny" }`. The result is client-bound, single-use and
expires after 15 minutes. Policy, ownership and memory versions are revalidated
before retrieval. A stale preview requires a new review; do not silently approve
a refreshed preview on the owner's behalf. Retrieval writes a disclosure audit.

## Owner resources

| Area                    | Route family                  | Behavior                                                    |
| ----------------------- | ----------------------------- | ----------------------------------------------------------- |
| Memories                | `/v1/memories`                | Create, search, edit, archive/delete and inspect provenance |
| Categories              | `/v1/categories`              | Owner-facing category catalog                               |
| Client category catalog | `/v1/memory-categories`       | Bearer-authenticated integration catalog                    |
| Clients and policies    | `/v1/clients`, `/v1/policies` | Manage trust, tokens and app permissions                    |
| Suggestions             | `/v1/memory-suggestions`      | Propose memory and review outcomes                          |
| Disclosure reviews      | `/v1/memory-request-reviews`  | Owner preview and decision                                  |
| Chat and voice          | `/v1/chat`                    | Threads, streams and source-bound voice sessions            |
| Processing              | `/v1/memory-processing`       | Capabilities, permission and source processing outcomes     |
| Jobs                    | `/v1/jobs`                    | Owner job history, settings and retries                     |
| Audit                   | `/v1/audit-events`            | Read owner-scoped audit events and subjects                 |
| Data control            | `/v1/data`                    | Export, import preview and confirmed import                 |
| Overview                | `/v1/overview`                | Owner aggregates and capture activity                       |

Use OpenAPI for exact methods and subpaths. Record IDs never substitute for
ownership: absent and foreign owned resources both return 404 where applicable.
Archived/deleted records follow the endpoint's lifecycle filters. Source-bound
processing distinguishes a missing/foreign source from an existing pending run.

## Pagination and dates

List endpoints that expose pagination accept `page` (default 1) and `limit`
(default 25, maximum 100). Their result includes:

```json
{
  "items": [],
  "pagination": { "page": 1, "limit": 25, "total": 0, "totalPages": 0 }
}
```

Some small catalogs return only `items`; check the endpoint schema. Filters use the
camelCase names in OpenAPI. Dates are ISO 8601 strings; nullable dates are `null`.
Provide an IANA timezone where a chat/voice contract accepts `timezone`; unspecified
prompt/extraction dates use UTC. Persistent timestamps remain instants in UTC.

## Error handling

Nest JSON endpoints use a common envelope:

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "A resource with the same unique value already exists.",
  "requestId": "<correlation id>"
}
```

Validation errors can include structured field issues. Do not depend on exact
message wording. Unexpected errors return a generic message; raw database details
and provider response bodies are not a client contract. Use the request ID when
reporting a failure, without attaching credentials or personal payloads.

| Status | Caller action                                                                          |
| ------ | -------------------------------------------------------------------------------------- |
| 400    | Fix request shape or invalid field values.                                             |
| 401    | Establish a session or replace an expired/revoked credential.                          |
| 403    | Respect the missing permission; authentication alone is insufficient.                  |
| 404    | Treat the owned resource as unavailable.                                               |
| 409    | Refresh conflicting state; duplicate names/rules and repeated decisions are conflicts. |
| 413    | Reduce the body; the API JSON envelope is limited to 10 MiB and MCP has its own cap.   |
| 429    | Back off and respect transport retry information.                                      |
| 503    | Inspect readiness/provider configuration and retry only when appropriate.              |

OAuth endpoints use OAuth protocol error envelopes. Streaming chat and MCP use
their own protocol framing; do not parse those streams as one JSON response.
Network failure does not prove a mutation failed: reload current state before
repeating an approval, import, or other consequential action.

## MCP tool mapping

| Tool                     | HTTP operation or local action                         |
| ------------------------ | ------------------------------------------------------ |
| `request_memory`         | `POST /v1/memory-requests`                             |
| `get_memory_request`     | `GET /v1/memory-requests/:id/result`                   |
| `suggest_memory`         | `POST /v1/memory-suggestions`                          |
| `list_memory_categories` | `GET /v1/memory-categories`                            |
| `open_consent_review`    | Builds the owner review URL; it does not grant access. |

Both MCP transports use the same tool definitions and validated responses. HTTP
sessions bind credentials to the session; rate limits operate before and after
authentication. The MCP process is single-instance because sessions and limits
are held in memory. Tool output cannot grant authority outside API policy.

## Keeping the contract current

Run `pnpm docs:openapi` after controller/DTO changes. It creates an unlistened Nest
application and exports the same document factory used by the running server;
no database connection or provider request is required. CI regenerates the file
and rejects unreviewed differences. Commit the generated JSON with the code and
update this guide when an integration workflow changes.

### App permissions contract

`purpose` is optional, nullable audit context on reads and suggestions. It is trimmed, blank becomes null, and the limit is 160 characters after trimming. Task is required for reads and drives retrieval. Caller identity comes from authentication; no policy selector is accepted.

Each client has at most one policy. Creating a second returns 409, “This app already has permissions”. Policy updates cannot move permissions to another client. `POST /v1/policies/defaults/:clientId` restores defaults only for an existing first-party app without permissions.

Read and suggestion responses include nullable `reason`: `unknown_or_blocked_client`, `no_client_policy`, `policy_expired`, `operation_not_allowed`, `no_matching_memories`, `no_allowed_memories`, `confirmation_required`, or `policy_changed`. Client-level denials contain no memory identifiers. Per-memory denial reasons retain their category, sensitivity, status and expiry distinctions.

OAuth `memory.read` gates requests and `memory.suggest` gates suggestions and captures. WRITE has no scope; an owner-granted WRITE permission allows eligible proposals to apply immediately. Capture remains review-only. Voice queues by default because its permissions omit WRITE; owners may grant WRITE to allow immediate application within the other permission limits. Caller `sourceMetadata` is nested under `caller` and cannot dispatch actions.

Exports use `funes-vault.export.v2`. Import rejects v1, duplicate policies for a client, and policies whose client is absent from the export.

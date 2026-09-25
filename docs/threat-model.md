# Threat Model

This is an initial threat model for Funes Vault. It should be revisited before any hosted launch or third-party integration.

## Assets

- User memories.
- Memory embeddings and derived summaries.
- Sensitivity labels and policy rules.
- Client credentials and access tokens.
- Audit logs.
- Encryption keys.
- Import sources.
- Disclosure bundles sent to clients.

## Trust Boundaries

### User Device Boundary

The browser holds session access, cached app-shell assets, and temporarily queued offline captures. Durable memories and conversations live on the server. Device compromise can expose pending captures and authenticated sessions.

### Client Boundary

Every external app, agent, browser extension, or LLM client is outside the vault trust boundary until registered and scoped.

### Model Provider Boundary

Any third-party model API receiving a memory bundle, chat prompt, or embedding input is outside Funes Vault's control. The first implementation expects OpenAI embeddings and Vercel AI SDK-mediated model calls, so provider disclosure must be explicit. Realtime voice sessions widen this boundary to raw microphone audio plus retrieved memory text streamed to the OpenAI Realtime API; mitigations are the dedicated voice first-party client policy (default ceiling `SENSITIVE`, review-gated new suggestions; correction tools still have direct user-scoped update/archive access), server-side ephemeral token minting so the provider key never reaches the browser, session duration/idle/daily caps, and voice-attributed audit events.

### Hosted Operator Boundary

Funes Vault server infrastructure is a distinct trust boundary. The current implementation is server-readable: operators can access plaintext memories and transcripts. Storage encryption, host access, and backups are operator responsibilities.

## Adversaries

- Malicious third-party client.
- Compromised trusted client.
- Prompt-injected agent.
- Local malware.
- Network attacker.
- Compromised hosted service.
- Curious or malicious service operator.
- Abusive integration partner.
- Accidental over-sharing by a legitimate client.

## Threats And Mitigations

| Threat                        | Example                                                                                              | Mitigations                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Overbroad memory request      | Client asks for all memories for a trivial task                                                      | Scopes, policy engine, disclosure preview, rate limits                                                                                                                                                                                                                                                                                                                                     |
| Prompt injection              | Webpage tells an agent to request sensitive memory                                                   | Structured requests, deny rules, sensitive approval gates                                                                                                                                                                                                                                                                                                                                  |
| Memory poisoning              | Client suggests false durable memories                                                               | Suggestion review, provenance, confidence, client trust levels                                                                                                                                                                                                                                                                                                                             |
| Secret capture                | Token or password is stored as a memory                                                              | Secret scanning before memory/suggestion writes, blocked secret category, redaction                                                                                                                                                                                                                                                                                                        |
| Sensitive inference           | Summary leaks health or financial facts indirectly                                                   | Sensitivity propagation, review derived memories                                                                                                                                                                                                                                                                                                                                           |
| Token theft                   | Client token is copied and reused                                                                    | Token rotation, HTTPS transport, expiration, audit anomalies                                                                                                                                                                                                                                                                                                                               |
| Hosted plaintext exposure     | Operator or breach reads memory                                                                      | Host access controls, operator-managed storage/backup encryption, and redacted logs; application-level end-to-end encryption is not implemented                                                                                                                                                                                                                                            |
| Cross-user leakage            | Hosted bug returns another user's memories                                                           | Tenant isolation, tests, authorization checks, audit alerts                                                                                                                                                                                                                                                                                                                                |
| Audit log leakage             | Audit log reveals sensitive facts                                                                    | Store typed subject references and compact metadata where possible, avoid duplicating memory bodies, encrypt sensitive event metadata later                                                                                                                                                                                                                                                |
| Deletion failure              | Deleted memory survives in summaries/backups                                                         | Derived memory invalidation, backup retention policy, deletion audit                                                                                                                                                                                                                                                                                                                       |
| Embedding disclosure surprise | Memory text or Vault search text is sent to OpenAI for embeddings without clear user understanding   | Provider settings, documented all-stored-memory default, `EMBEDDINGS_MAX_SENSITIVITY` opt-down, secret-like query fallback, job/audit metadata, local-provider option later                                                                                                                                                                                                                |
| Unsafe consolidation          | Daily job rewrites or merges memories incorrectly                                                    | Disabled/review-only by default, explicit auto-apply opt-in, typed provenance, job action summaries, audit subjects                                                                                                                                                                                                                                                                        |
| Export leakage                | User downloads a broad JSON export and stores it somewhere unsafe                                    | Explicit data-control surface, filtered exports, no client token material, audit refs optional                                                                                                                                                                                                                                                                                             |
| Import poisoning              | A crafted export injects false or overbroad memory into the vault                                    | Strict schema validation, duplicate preview, default import as reviewable suggestions                                                                                                                                                                                                                                                                                                      |
| Remote MCP listener abuse     | A machine on the network probes the MCP HTTP endpoint or a browser page attacks it via DNS rebinding | Bearer client-token auth verified against the API before a session starts, sessions bound to the presenting token hash, Origin allowlist (browser Origins denied by default), explicit bind-address configuration defaulting to `127.0.0.1`, pre-authentication socket-IP and per-client rate limiting, 1 MiB body limits, idle session expiry, transport recorded in audit metadata       |
| Public listener probing       | Internet scanners hit the public app, API, or MCP routes                                             | Reverse proxy routes the web, authenticated app API, and scoped MCP/OAuth origins; administrative endpoints stay private; per-IP rate limits on all OAuth endpoints (MCP SDK defaults); unauthenticated `/mcp` returns only a 401 with discovery metadata                                                                                                                                  |
| DCR registration spam         | A bot floods the public `/register` endpoint with client registrations                               | Registrations are approval-pending rows with zero access until a user consents, per-IP rate limiting on `/register`, `OAUTH_MAX_PENDING_REGISTRATIONS` cap, redirect URIs restricted to https or loopback                                                                                                                                                                                  |
| Malicious OAuth client        | A rogue "connector" registers with a plausible name and tricks the user into consenting              | Explicit consent screen shows the client name, redirect host, scopes, and a not-vetted warning; grants are scoped to `memory.read`/`memory.suggest` with an `INTERNAL` disclosure ceiling by default; every disclosure is audited and the grant is one click from revocation in Apps & access                                                                                              |
| OAuth token theft             | An access or refresh token leaks from the connector or network                                       | All credentials stored as SHA-256 hashes (a database leak yields no usable tokens), access tokens expire in 1 hour, refresh tokens rotate on every use and reuse of a rotated token revokes the grant's whole token family, authorization codes are single-use and replay revokes derived tokens, PKCE (S256) binds codes to the requesting client, revocation is user-visible and audited |
| Forged consent approval       | A malicious page auto-submits the consent form in a logged-in user's browser                         | Session cookie is `SameSite=Lax` so cross-site form posts arrive unauthenticated; consent decisions additionally require the per-request nonce bound to the authorization request                                                                                                                                                                                                          |

## Prompt Injection Policy

Funes Vault should treat client requests as potentially influenced by untrusted text. The service should not let freeform task text override:

- User policies.
- Sensitivity gates.
- Client scopes.
- Deny lists.
- Storage restrictions.
- Approval requirements.

## Security Controls For Prototype

- Bind published API, web, and MCP container ports to loopback by default. Container listeners bind inside the deployment network; the HTTPS proxy is the public entry point.
- The connector origin exposes only MCP, OAuth, and discovery routes. Separate web and API origins provide browser access; `/health` is a minimal public liveness check, while readiness and operator routes stay private. OAuth 2.1 (PKCE-only public clients, dynamic registration held approval-pending, hashed single-use codes, rotating refresh tokens) fronts the public MCP transport; protocol handling comes from the MCP SDK's auth framework rather than hand-rolled code.
- Require multi-user authentication for the web UI.
- Rate limit Google sign-in initiation to 20/minute and account deletion to 5/minute per IP; retain the global ceiling.
- Gate seeded demo login on exactly `NODE_ENV=development` on the server, reject linked/elevated accounts, and use only the fixed demo fixture. Never deploy development mode publicly or against real user data.
- Remove password authentication. Bind Google login to an HTTP-only browser cookie, PKCE, state, nonce, verified signed ID tokens, and a single-use ten-minute database attempt. Never link vaults by email.
- Require an explicit same-identity Google round trip tied to the current session before deletion, followed by confirmation within five minutes. Google may reuse its own login session; this is not enforced password/MFA reauthentication.
- Restrict callback return paths; omit callback/consent queries and redirect headers from access logs. Expired attempts are cleaned at sign-in initiation.
- Gate the Bull Board queue dashboard behind an ADMIN/OWNER session, and keep it disabled unless `BULL_BOARD_ENABLED=true`.
- Sanitize error responses through a global exception filter: validation errors return field paths without echoing submitted values, database and readiness errors never expose driver details, and every response carries a request id for log correlation.
- Require per-client registration.
- Store client tokens hashed.
- Log every disclosure.
- Secret-scan memory creation and suggestions. Current API services reject private-key blocks, common API-token formats, JWT-like values, and assigned secret fields before storage.
- Default unknown or blocked clients to denied by the policy evaluator; approval-gated disclosure can be layered on top of explicit preview flows.
- Record append-only memory provenance and typed audit subjects for memory lifecycle events, disclosures, suggestions, imports, jobs, and consolidation actions. These rows are tenant-scoped and carry IDs, roles, compact labels, reason codes, confidence, and evidence instead of full memory body snapshots.

## Future hosted-mode controls (not shipped guarantees)

- Strong account auth with MFA support.
- Per-user encryption keys.
- Centralized audit logging.
- Key rotation.
- Backups with retention policy.
- Incident response plan.
- External security review before public launch.

The following is an evaluation backlog, not a description of the current product.
OAuth/OIDC client authorization, tenant-isolation tests and role-gated operator access already ship. Hosted service operations, per-user encryption and enforced MFA require additional work.

## Open Threat Model Questions

- Is client-side encryption required for the hosted product?
- Will the hosted service support server-side semantic search over plaintext?
- How should user approval work for headless clients?
- Can a client be blocked from access based on declared downstream processors?
- What logs are safe to collect for debugging without harming privacy?

## Configurable memory processing

Memory extraction defends against tool bypass with server-issued candidates, against duplicate delivery with database source/candidate uniqueness, and against stale attempts with leases/claim tokens. Exact UTF-16 evidence validation rejects invented support. The current owner provider choice is rechecked at provider boundaries and commit; historical transmission cannot be revoked. Stale consolidation actions revalidate both target and survivor under transaction locks. See [processing threat boundaries](memory-processing.md).

### Login flow secrets

Login attempts keep the PKCE verifier and OpenID nonce in plaintext for the short
redirect window. State and browser-binding tokens are hashed. A callback consumes
the attempt once; starting another login sweeps expired attempts. Database readers
can see pending verifiers, so database access remains a trusted administrative boundary.

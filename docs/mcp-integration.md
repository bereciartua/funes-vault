# MCP Integration

The primary connection is `https://<MCP_DOMAIN>/mcp` on the configured server. Production Compose includes the HTTP service; the HTTPS override routes it alongside OAuth. Settings → Apps & access supplies the connection guide. The stdio setup below is optional compatibility/developer tooling and does not host or store the vault locally.

Funes Vault exposes an MCP server from `packages/mcp` over two transports: local stdio and Streamable HTTP for remote clients. Both run as separate processes and call the NestJS HTTP API with a bearer token, so memory retrieval, suggestions, policy evaluation, and audit logging use the same backend paths as external HTTP clients. Audit metadata records which transport carried each request (`mcp_stdio`, `mcp_http`, or `http_api` for direct API calls).

Two kinds of bearer tokens work on the HTTP transport: static client tokens created in Apps & access (private network or VPN use) and OAuth 2.1 access tokens issued to vendor assistant connectors (public exposure). The sidecar does not care which kind it receives — it forwards the token to the API, whose client auth guard resolves either kind to the same per-user client identity.

## Local Setup

Install Node 24, pnpm 11.7 and Docker, then initialize a development checkout:

```bash
cp .env.example .env
pnpm install --frozen-lockfile
docker compose up -d
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm --filter "./packages/*" build
pnpm --filter @funes-vault/api dev
```

The seed creates an approved MCP client named `Local Coding Agent` with token:

```text
fvlt_seed_demo_token
```

## Run The MCP Server

Build the MCP package:

```bash
pnpm --filter @funes-vault/shared build
pnpm --filter @funes-vault/mcp build
```

Configure an MCP-compatible client to run:

```bash
FUNES_VAULT_API_URL=http://localhost:4000 \
FUNES_VAULT_APP_URL=http://localhost:3000 \
FUNES_VAULT_CLIENT_TOKEN=fvlt_seed_demo_token \
pnpm --filter @funes-vault/mcp start
```

The tools are:

- `request_memory`: calls `POST /v1/memory-requests`.
- `get_memory_request`: calls `GET /v1/memory-requests/:id/result` to resume a reviewed request; approved text is retrieved once within 15 minutes.
- `suggest_memory`: calls `POST /v1/memory-suggestions`; queues for review unless a WRITE policy permits immediate saving.
- `list_memory_categories`: calls `GET /v1/memory-categories`.
- `open_consent_review`: returns the configured website URL for reviewing a pending request or suggestion.

## Remote Access Over A Private Network

The Streamable HTTP transport lets MCP clients on other machines use the vault without stdio. It is intended for a private network or VPN with existing client bearer tokens; the primary server deployment also supports HTTPS and OAuth.

Start the HTTP server after building the package:

```bash
FUNES_VAULT_API_URL=http://localhost:4000 \
FUNES_VAULT_MCP_HTTP_HOST=<private-ip> \
pnpm --filter @funes-vault/mcp start:http
```

The MCP endpoint is `http://<host>:4100/mcp` by default, plus a `GET /healthz` probe. Configuration:

| Variable                                | Default     | Meaning                                                                                                                                                                                                                                                                                                              |
| --------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FUNES_VAULT_MCP_HTTP_HOST`             | `127.0.0.1` | Bind address. Set explicitly to a private network or VPN IP for remote use; never bind to a public interface.                                                                                                                                                                                                        |
| `FUNES_VAULT_MCP_HTTP_PORT`             | `4100`      | Listen port.                                                                                                                                                                                                                                                                                                         |
| `FUNES_VAULT_MCP_HTTP_PATH`             | `/mcp`      | MCP endpoint path.                                                                                                                                                                                                                                                                                                   |
| `FUNES_VAULT_MCP_ALLOWED_ORIGINS`       | empty       | Comma-separated Origin allowlist. Requests with a browser `Origin` header are rejected unless listed, which blocks DNS-rebinding pages. Non-browser clients send no Origin and are unaffected.                                                                                                                       |
| `FUNES_VAULT_MCP_ALLOWED_HOSTS`         | empty       | Optional comma-separated Host allowlist (with or without port).                                                                                                                                                                                                                                                      |
| `FUNES_VAULT_MCP_SESSION_TTL_MS`        | `1800000`   | Idle session expiry.                                                                                                                                                                                                                                                                                                 |
| `FUNES_VAULT_MCP_RATE_LIMIT_MAX`        | `120`       | Requests allowed per client token per window.                                                                                                                                                                                                                                                                        |
| `FUNES_VAULT_MCP_RATE_LIMIT_WINDOW_MS`  | `60000`     | Rate limit window.                                                                                                                                                                                                                                                                                                   |
| `FUNES_VAULT_MCP_RESOURCE_METADATA_URL` | empty       | Public RFC 9728 protected-resource metadata URL, e.g. `https://<public-host>/.well-known/oauth-protected-resource/mcp`. When set, 401 responses advertise it in `WWW-Authenticate` so OAuth connectors can discover the authorization server. Required for public exposure, unnecessary on a private network or VPN. |

Every request must carry a registered client token as `Authorization: Bearer <token>`. The token is verified against the API when a session initializes, and the session is bound to that token: presenting a live session id with a different token returns 404, so sessions cannot leak across client identities.

Connect Claude Code from another machine on the private network or VPN:

```bash
claude mcp add --transport http funes-vault http://<private-host>:4100/mcp \
  --header "Authorization: Bearer fvlt_seed_demo_token"
```

Or MCP Inspector:

```bash
npx @modelcontextprotocol/inspector --cli http://<private-host>:4100/mcp \
  --transport http \
  --header "Authorization: Bearer fvlt_seed_demo_token" \
  --method tools/list
```

Remote calls return the same policy-filtered bundles as stdio because both transports proxy the same API endpoints with the same client identity.

## Vendor Assistant Connectors (OAuth)

Vendor assistant apps (Claude, ChatGPT) add remote MCP servers as custom connectors and require OAuth 2.1 with PKCE and dynamic client registration instead of static tokens. The API hosts the authorization server (see [ADR 0024](adr/0024-the-oauth-authorization-server-lives-inside-the-nestjs-api-built-on-the-mcp-sdk-auth-framework.md)); the MCP sidecar stays the protected resource. The connector flow is:

1. The connector hits `/mcp` without a token, gets a 401 whose `WWW-Authenticate` header points at the protected resource metadata, and discovers the authorization server from it.
2. It registers itself via `POST /register` (dynamic client registration). Registrations are stored approval-pending and grant no access by themselves.
3. It sends the user's browser to `/authorize` (PKCE, S256 only). The API renders a consent screen — signing in with the vault account if needed — showing the requesting client, the scopes, and the grant's disclosure ceiling.
4. Approval creates or updates a per-user client grant: a `Client` (type `MCP_CLIENT`, trust `APPROVED`, visible in Apps & access with an "OAuth connector" badge) plus an `mcp_connector` policy whose operations come from the granted scopes.
5. The connector exchanges its code at `/token` for an access/refresh token pair. Access tokens work on `/mcp` and map to the grant; refresh tokens rotate on every use.

Scopes:

| Scope            | Grants                                                                   |
| ---------------- | ------------------------------------------------------------------------ |
| `memory.read`    | `request_memory` (policy-filtered bundles), maps to the `READ` operation |
| `memory.suggest` | `suggest_memory` (review-queued suggestions), maps to `SUGGEST`          |

The connector-grant policy defaults to a `maxSensitivity` of `INTERNAL` (`MCP_CONNECTOR_MAX_SENSITIVITY` sets the creation default) with no per-request confirmation; the user can tighten or widen it in Apps & access like any policy. Requests under purposes other than `mcp_connector` follow the normal needs-approval flow.

Revocation works from both sides: deleting the grant client (or setting its trust to blocked) in Apps & access revokes all issued tokens immediately, and connectors can revoke their own tokens at `/revoke` (RFC 7009). Replayed authorization codes and reused rotated refresh tokens revoke the grant's whole token family. Every issuance and revocation is audited (`OAUTH_TOKEN_ISSUED`, `OAUTH_TOKEN_REVOKED`, `OAUTH_GRANT_APPROVED`, `OAUTH_GRANT_DENIED`).

To add Funes Vault as a Claude custom connector from a phone: Settings → Connectors → Add custom connector, with the public MCP URL (`https://<public-host>/mcp`). Claude registers, opens the consent screen in the browser, and connects after approval. The public deployment layout this requires is documented in [Deployment And Operations](./deployment-and-operations.md#public-https-routing).

Note that MCP sessions are bound to the presenting token, so after a token refresh the connector transparently re-initializes its MCP session; this is expected and costs one extra round trip.

## Demo Request

After building the package and starting the API, run:

```bash
FUNES_VAULT_API_URL=http://localhost:4000 \
FUNES_VAULT_CLIENT_TOKEN=fvlt_seed_demo_token \
pnpm --filter @funes-vault/mcp demo:request-memory -- "Help with this repository"
```

The demo prints the same policy-filtered memory bundle returned by `POST /v1/memory-requests`. Fulfilled requests create `MemoryRequestItem` rows and `MEMORY_DISCLOSURE` audit events.

## Tool Inputs

`request_memory` accepts camelCase or MCP-style snake_case fields:

```json
{
  "purpose": "software_development",
  "task": "Help with this repository",
  "requested_categories": ["communication_style", "project_context"],
  "retention": "NO_STORAGE",
  "third_party_processors": [],
  "token_budget": 1200
}
```

`suggest_memory` requires a declared purpose so the API can evaluate `SUGGEST` policy access:

```json
{
  "purpose": "software_development",
  "kind": "preference",
  "title": "Prefers local-first tools",
  "body": "The user prefers local-first tools for privacy-sensitive workflows.",
  "categories": ["privacy_preferences"],
  "confidence": 0.8
}
```

Unknown clients, blocked clients, missing policies, denied categories, and sensitivity ceilings are denied by the API before any suggestion is stored.

## Reverse-proxy identity and shutdown

`FUNES_VAULT_MCP_TRUSTED_PROXIES` is a comma-separated list of exact immediate
proxy IP addresses (Compose: `MCP_TRUSTED_PROXIES`). Leave it empty for direct
connections. Behind Caddy, set it to Caddy's reachable IP and keep the MCP port
private. Only these peers may supply `X-Forwarded-For`; the nearest forwarded hop
keys the pre-authentication limiter. Untrusted headers cannot change identity.
Token-level limits remain in effect. HTTP shutdown handles SIGTERM/SIGINT and
closes transports; production Compose also supplies an init process.

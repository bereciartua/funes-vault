# 0024 — The OAuth Authorization Server Lives Inside The NestJS API, Built On The MCP SDK Auth Framework

Date: 2026-07-04

Status: accepted

## Context and problem

The connector identity review asked whether to build the authorization server in the API or put an OAuth-terminating gateway (e.g. oauth2-proxy, an external IdP) in front that maps identities onto Funes clients. Vendor connectors (Claude, ChatGPT) require OAuth 2.1 with PKCE, dynamic client registration, and discovery metadata against a public endpoint, and the consent decision must create a Funes client grant — a per-user, per-client policy — which no generic gateway understands.

## Considered options

(1) an OAuth gateway in front — keeps protocol code out of the API, but the consent screen is the client-grant approval flow, so the gateway would need deep calls back into the client/policy/audit model, and identity mapping between gateway tokens and Funes grants becomes a second source of truth; (2) hand-rolled endpoints in NestJS — full control but bespoke protocol code in exactly the place defects are security-relevant; (3) the MCP SDK auth framework inside the API — chosen: the protocol layer is maintained and reviewed upstream alongside the MCP auth spec it implements, the provider callbacks land directly on Prisma, the existing Google-backed session powers the consent login, and the audit trail writes through the same `AuditTrailService` as every other grant change.

## Decision outcome

OAuth 2.1 authorization for MCP connectors is implemented inside the NestJS API, not as a separate OAuth-terminating gateway. The protocol surface — `/authorize`, `/token`, `/register`, `/revoke`, and the RFC 8414/9728 metadata documents — is served by the MCP TypeScript SDK's authorization-server framework (`mcpAuthRouter`), mounted on the API's Express instance, with a Prisma-backed `OAuthServerProvider` supplying storage and the consent flow. PKCE (S256, mandatory), dynamic client registration, redirect-URI validation, and per-endpoint rate limiting come from the SDK; Funes implements only the provider: registrations persist as approval-pending `OAuthClientRegistration` rows, the consent screen is a server-rendered page on the API that reuses the existing Google-backed session, and approval creates or updates a per-user `Client` (type `MCP_CLIENT`, trust `APPROVED`) plus an `mcp_connector` policy whose operations come from the granted scopes (`memory.read` → READ, `memory.suggest` → SUGGEST). All dynamically registered clients are forced to be public clients (`token_endpoint_auth_method: none`); the only issued credentials are authorization codes and access/refresh tokens, stored exclusively as SHA-256 hashes. The MCP sidecar stays a pure resource server: it forwards whatever bearer token it receives to the API, which accepts both static client tokens and OAuth access tokens through the same guard.

## Consequences

The API gains public-facing OAuth routes, which the connector proxy must scope precisely (only `/authorize`, `/token`, `/register`, `/revoke`, `/.well-known/*`, and the sidecar's `/mcp`); the API depends on `@modelcontextprotocol/sdk` for the auth router; confidential clients are not supported (acceptable — MCP connectors are public clients by spec); token verification stays API-side so the sidecar needs no crypto and static app tokens keep working unchanged; the consent screen renders from the API on the connector origin so it works independently of the main web app.

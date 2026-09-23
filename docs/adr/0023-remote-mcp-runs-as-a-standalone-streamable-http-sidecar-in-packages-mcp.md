# 0023 — Remote MCP Runs As A Standalone Streamable HTTP Sidecar In packages/mcp

Date: 2026-07-04

Status: accepted

## Context and problem

The transport review asked whether the HTTP transport should be mounted in the NestJS API or run standalone. The MCP server is already a thin proxy that calls the HTTP API with a bearer token, and `packages/mcp` already ships as its own Docker image. The connector proxy exposes a narrow OAuth and MCP surface.

## Considered options

(1) mount the transport in the NestJS API process — fewer processes, but it either duplicates the proxy loop inside the API or bypasses it with direct service calls, creating a second enforcement path for auth/policy/audit and putting an MCP protocol server inside the API's network surface; (2) standalone sidecar in `packages/mcp` — chosen, because the API stays the single authority for auth, policy, and audit, the stdio and HTTP transports share the exact same server factory and tool code, and the connector proxy can forward the sidecar alone without exposing any API route.

## Decision outcome

The MCP Streamable HTTP transport runs as a standalone server in `packages/mcp` (`funes-vault-mcp-http`, default `127.0.0.1:4100/mcp`), not mounted inside the NestJS API process. Each HTTP session authenticates with an existing client bearer token; the sidecar verifies the token against the API on session initialization and then forwards every tool call to the same `/v1/*` endpoints the stdio server uses, so client identity, policy evaluation, and audit behavior are identical across transports. Sessions are bound to the SHA-256 hash of the presenting token; a request that offers a known session id with a different token gets a 404, so one client identity can never continue another identity's session. Hardening is part of the listener: browser Origins are denied unless allowlisted (`FUNES_VAULT_MCP_ALLOWED_ORIGINS`), an optional Host allowlist guards DNS rebinding by hostname, bind address and port are explicit configuration, per-client-token fixed-window rate limiting applies before any API call, and idle sessions expire after a TTL. Tool calls carry an `x-funes-vault-mcp-transport` header (`stdio` or `http`) that the API records as `transport` (`mcp_stdio`, `mcp_http`, or `http_api` for direct calls) in disclosure and suggestion audit metadata.

## Consequences

Remote MCP use requires running one more process (`pnpm --filter @funes-vault/mcp start:http`), and each HTTP session costs one extra API call (`GET /v1/memory-categories`) to validate its token up front. The stdio entrypoint is unchanged. Use static tokens only over a trusted private network or VPN; public connectors use the OAuth grant flow.

import { apiEnv } from "../config.js";

const defaultAccessTokenTtlSeconds = 60 * 60;
const defaultRefreshTokenTtlSeconds = 30 * 24 * 60 * 60;
const defaultAuthorizationRequestTtlMs = 10 * 60 * 1000;
const defaultAuthorizationCodeTtlMs = 5 * 60 * 1000;
const defaultMaxPendingRegistrations = 50;

// The issuer is the public origin OAuth clients see through the tunnel. In
// development it falls back to the API's own origin, which the MCP SDK
// accepts unencrypted only for localhost.
export function oauthIssuerUrl() {
  const configured = apiEnv().OAUTH_ISSUER_URL?.trim();

  if (configured) {
    return new URL(configured.replace(/\/+$/, ""));
  }

  const port = apiEnv().API_PORT;

  return new URL(`http://localhost:${port}`);
}

// The MCP resource identifier advertised in protected resource metadata.
// Defaults to <issuer>/mcp, matching the tunnel layout where the sidecar's
// /mcp route and the API's OAuth routes share one public host.
export function oauthMcpResourceUrl() {
  const configured = apiEnv().OAUTH_MCP_RESOURCE_URL?.trim();

  if (configured) {
    return new URL(configured);
  }

  return new URL("/mcp", oauthIssuerUrl());
}

export function oauthAccessTokenTtlSeconds() {
  return (
    apiEnv().OAUTH_ACCESS_TOKEN_TTL_SECONDS ?? defaultAccessTokenTtlSeconds
  );
}

export function oauthRefreshTokenTtlSeconds() {
  return (
    apiEnv().OAUTH_REFRESH_TOKEN_TTL_SECONDS ?? defaultRefreshTokenTtlSeconds
  );
}

export function oauthAuthorizationRequestTtlMs() {
  return defaultAuthorizationRequestTtlMs;
}

export function oauthAuthorizationCodeTtlMs() {
  return defaultAuthorizationCodeTtlMs;
}

// Cap on approval-pending dynamic registrations, so an exposed /register
// endpoint cannot fill the database. Approved registrations do not count.
export function oauthMaxPendingRegistrations() {
  return (
    apiEnv().OAUTH_MAX_PENDING_REGISTRATIONS ?? defaultMaxPendingRegistrations
  );
}

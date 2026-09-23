import { z } from "zod";

export const mcpTransportHeaderName = "x-funes-vault-mcp-transport";

export const mcpTransportSchema = z.enum(["stdio", "http"]);

export type McpTransport = z.infer<typeof mcpTransportSchema>;

export const auditTransportSchema = z.enum([
  "http_api",
  "mcp_stdio",
  "mcp_http"
]);

export type AuditTransport = z.infer<typeof auditTransportSchema>;

export function toAuditTransport(value: unknown): AuditTransport {
  const parsed = mcpTransportSchema.safeParse(value);

  return parsed.success ? `mcp_${parsed.data}` : "http_api";
}

// OAuth scopes granted to MCP connectors. Each scope maps to a policy
// operation on the connector's client grant: memory.read -> READ,
// memory.suggest -> SUGGEST.
export const oauthScopeRead = "memory.read";

export const oauthScopeSuggest = "memory.suggest";

export const oauthSupportedScopes = [
  oauthScopeRead,
  oauthScopeSuggest
] as const;

export type OAuthScope = (typeof oauthSupportedScopes)[number];

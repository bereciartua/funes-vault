import type { OAuthScope } from "@funes-vault/shared";
import { SetMetadata } from "@nestjs/common";

export const requiredClientScopeKey = "funesRequiredClientScope";

// Marks a client-token route as requiring an OAuth scope. Static client
// tokens are unaffected: their access is governed entirely by policies.
export const RequireClientScope = (scope: OAuthScope) =>
  SetMetadata(requiredClientScopeKey, scope);

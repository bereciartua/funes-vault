import type { AuthUser, Client } from "@funes-vault/shared";
export type FunesRequest = {
  headers: {
    cookie?: string;
    "x-funes-owner-id"?: string;
    authorization?: string;
  };
  user?: AuthUser;
  sessionId?: string;
  sessionToken?: string;
  client?: Client;
  clientUserId?: string;
  clientTokenType?: "static" | "oauth";
  oauthScopes?: string[];
};

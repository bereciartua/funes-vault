import { randomBytes, timingSafeEqual } from "node:crypto";

import { hashToken } from "@funes-vault/shared/tokens";

export function createOAuthAccessToken() {
  return `fvoa_${randomBytes(32).toString("base64url")}`;
}

export function createOAuthRefreshToken() {
  return `fvor_${randomBytes(32).toString("base64url")}`;
}

export function createOAuthAuthorizationCode() {
  return `fvac_${randomBytes(32).toString("base64url")}`;
}

export function createConsentNonce() {
  return randomBytes(24).toString("base64url");
}

export const hashOAuthCredential = hashToken;

export function credentialMatchesHash(value: string, hash: string) {
  const candidate = Buffer.from(hashOAuthCredential(value));
  const expected = Buffer.from(hash);

  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  );
}

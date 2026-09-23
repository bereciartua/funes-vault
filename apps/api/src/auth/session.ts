import { randomBytes } from "node:crypto";

import { hashToken } from "@funes-vault/shared/tokens";

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export const hashSessionToken = hashToken;

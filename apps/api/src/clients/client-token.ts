import { randomBytes } from "node:crypto";

export function createClientToken() {
  return `fvlt_${randomBytes(32).toString("base64url")}`;
}

export { hashToken } from "@funes-vault/shared/tokens";

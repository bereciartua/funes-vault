import { createHash } from "node:crypto";
/** SHA-256 digest for opaque credentials; encoding preserves existing stored hashes. */
export function hashToken(
  token: string,
  encoding: "base64url" | "hex" = "base64url"
) {
  return createHash("sha256").update(token).digest(encoding);
}

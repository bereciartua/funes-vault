/** Per-document nonce; connect sources use only this deployment's API and Realtime provider. */
export function webSecurityPolicy(
  nonce: string,
  apiUrl: string,
  development: boolean
) {
  const apiOrigin = new URL(apiUrl).origin;

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${apiOrigin} https://api.openai.com${development ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
    "media-src 'self' blob:",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'"
  ].join("; ");
}

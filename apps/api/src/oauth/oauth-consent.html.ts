import { oauthScopeRead, oauthScopeSuggest } from "@funes-vault/shared";

import type { ConsentContext } from "./oauth-grants.service.js";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const scopeDescriptions: Record<string, string> = {
  [oauthScopeRead]:
    "Request policy-filtered memory bundles (never memories above the grant's sensitivity ceiling)",
  [oauthScopeSuggest]:
    "Propose memories; App permissions determine whether they queue for review or apply immediately"
};

function pageShell(title: string, body: string) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} — Funes Vault</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
         margin: 0; padding: 24px; display: flex; justify-content: center;
         background: Canvas; color: CanvasText; }
  main { max-width: 420px; width: 100%; }
  h1 { font-size: 1.25rem; margin: 24px 0 4px; }
  p { line-height: 1.5; }
  .muted { opacity: 0.7; font-size: 0.875rem; }
  .card { border: 1px solid color-mix(in srgb, CanvasText 18%, transparent);
          border-radius: 12px; padding: 20px; margin: 16px 0; }
  ul { padding-left: 20px; } li { margin: 8px 0; line-height: 1.4; }
  label { display: block; font-size: 0.875rem; margin: 12px 0 4px; }
  input { width: 100%; box-sizing: border-box; padding: 10px; border-radius: 8px;
          border: 1px solid color-mix(in srgb, CanvasText 25%, transparent);
          background: transparent; color: inherit; font-size: 1rem; }
  .actions { display: flex; gap: 12px; margin-top: 20px; }
  button { flex: 1; padding: 10px 16px; border-radius: 8px; font-size: 1rem;
           cursor: pointer; border: 1px solid color-mix(in srgb, CanvasText 25%, transparent);
           background: transparent; color: inherit; }
  button.primary { background: #4f46e5; border-color: #4f46e5; color: white; }
  .error { color: #dc2626; font-size: 0.875rem; }
  .brand { font-weight: 600; letter-spacing: 0.02em; }
</style>
</head>
<body><main><span class="brand">Funes Vault</span>${body}</main></body>
</html>`;
}

export function renderLoginPage(input: {
  requestId: string;
  nonce: string;
  error?: string;
}) {
  return pageShell(
    "Sign in",
    `
<h1>Sign in to continue</h1>
<p class="muted">An application is asking for access to your memory vault. Sign in to review the request.</p>
<div class="card">
  ${input.error ? `<p class="error">${escapeHtml(input.error)}</p>` : ""}
  <a href="/auth/google?returnTo=${encodeURIComponent(`/oauth/consent?${new URLSearchParams({ request: input.requestId, nonce: input.nonce })}`)}">Continue with Google</a>
</div>`
  );
}

export function renderConsentPage(input: {
  context: ConsentContext;
  nonce: string;
  userEmail: string;
}) {
  const { context } = input;
  const scopeItems = context.scopes
    .map(
      (scope) =>
        `<li><strong>${escapeHtml(scope)}</strong><br><span class="muted">${escapeHtml(
          scopeDescriptions[scope] ?? "Unknown scope"
        )}</span></li>`
    )
    .join("");

  return pageShell(
    "Approve access",
    `
<h1>${escapeHtml(context.clientName)} wants access to your vault</h1>
<p class="muted">Signed in as ${escapeHtml(input.userEmail)}</p>
<div class="card">
  <p><strong>${escapeHtml(context.clientName)}</strong>${
    context.clientUri
      ? ` <span class="muted">(${escapeHtml(context.clientUri)})</span>`
      : ""
  } will be able to:</p>
  <ul>${scopeItems}</ul>
  <p><strong>App permissions after approval:</strong> ${escapeHtml(context.operations.join(", "))}</p>
  <p>${context.createsPermissions ? "Approving creates permissions, including when you previously removed them." : "Existing category, sensitivity, confirmation and expiration settings are preserved."}</p>
  <p>Allowed categories: ${escapeHtml(context.allowedCategories.join(", ") || "All categories")}. Denied categories: ${escapeHtml(context.deniedCategories.join(", ") || "None")}.</p>
  <p>Confirmation: ${context.requiresConfirmation ? "Required" : "Not required"}. Expiration: ${escapeHtml(context.expiresAt ?? "None")}.</p>
  ${context.operations.includes("WRITE") ? "<p>Proposals from this app are applied immediately without review when permitted by these limits.</p>" : ""}
  <p class="muted">The disclosure ceiling is
  <strong>${escapeHtml(context.maxSensitivity.toLowerCase())}</strong> sensitivity.
  Every disclosure is audited, and you can revoke this grant at any time in
  Apps &amp; access. After approval, the app redirects to
  <strong>${escapeHtml(context.redirectHost)}</strong>.</p>
  <form method="post" action="/oauth/consent/decision">
    <input type="hidden" name="request" value="${escapeHtml(context.requestId)}">
    <input type="hidden" name="nonce" value="${escapeHtml(input.nonce)}">
    <div class="actions">
      <button type="submit" name="decision" value="deny">Deny</button>
      <button class="primary" type="submit" name="decision" value="approve">Approve</button>
    </div>
  </form>
</div>
<p class="muted">Only approve applications you recognize. This registration was
created by the requesting application and is not vetted by Funes Vault.</p>`
  );
}

export function renderErrorPage(message: string) {
  return pageShell(
    "Request problem",
    `
<h1>This request cannot continue</h1>
<div class="card"><p>${escapeHtml(message)}</p>
<p class="muted">Return to the application and start the connection again.</p></div>`
  );
}

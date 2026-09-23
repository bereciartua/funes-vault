# 0036 — Restore development-only seeded demo access

Date: 2026-09-20

Status: accepted

## Context and problem

Contributors need to run a synthetic vault without obtaining Google credentials. Production identity requirements must stay enforced by the server.

## Decision outcome

Refines the Google-only identity decision: production remains Google-only, while the normal development command enables password-free access to the fixed seeded vault. The API checks exactly `NODE_ENV=development`; the UI discovers availability at runtime. Demo login shares ordinary opaque sessions and makes no identity-provider request. Keep openid-client for protocol handling; multi-provider account modeling and provider selection remain future work.

## Consequences

Development can exercise a synthetic vault without Google credentials. Public deployments must use production mode; API-side checks, rather than a browser build flag, determine demo availability.

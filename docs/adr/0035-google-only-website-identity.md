# 0035 — Google-only website identity

Date: 2026-09-20

Status: accepted

## Context and problem

The first release needs one production identity flow and reliable identity confirmation before account deletion. Password handling adds security-sensitive lifecycle work that is outside the intended product scope.

## Decision outcome

Supersedes the earlier email/password and demo-login decisions. Use Google OpenID Connect via openid-client, retaining NestJS-owned database sessions. There are no existing users to migrate; remove password credentials/routes/forms rather than maintain account linking. Identity is keyed by Google subject, and email collisions fail closed. Google tokens are not retained. MCP consent redirects to the canonical API origin to share the login session. Account deletion requires a fresh same-subject check in the same session, then explicit confirmation. Local development uses registered HTTP localhost callbacks. Browser tests compile a separate API executable with a DI-overridden provider; no demo-login build flag remains. See [setup and security details](../google-sign-in.md).

## Consequences

Production sign-in depends on Google configuration and verified identity subjects. Existing password routes disappear; opaque local sessions remain revocable, and deletion requires a fresh identity round trip.

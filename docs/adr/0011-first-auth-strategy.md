# 0011 — First Auth Strategy

Date: 2026-06-26

Status: superseded

Superseded by: [0035 — Google-only website identity](0035-google-only-website-identity.md).

## Context and problem

This works locally and self-hosted, supports multiple users from the beginning, keeps sessions revocable, and does not force a hosted auth provider decision before the deployment model is settled.

## Decision outcome

Use NestJS-owned email/password authentication with opaque database-backed session cookies.

## Consequences

The original implementation needed password hashing, reset behavior and server-side session revocation. This historical identity choice was later replaced by Google sign-in in ADR 0035.

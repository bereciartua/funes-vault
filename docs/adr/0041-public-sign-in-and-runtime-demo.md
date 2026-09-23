# 0041 — Public sign-in and runtime demo

Date: 2026-09-22

Status: accepted

## Context and problem

The original public page placed the auth form inline and selected demo visibility at build time. The release needs a compact public entry and a production-safe identity boundary.

## Decision outcome

Show Google sign-in in an accessible dialog and restore focus to the button that opened it. Discover demo availability from the API at runtime; only a development API may enable the fixed synthetic vault.

## Consequences

This supersedes ADR 0016’s form placement and build flag. Sign-in and consent use full-page redirects. Browser tests cover the consent redirect under CSP and code exchange. Cross-origin popup opener continuity is not supported; the API retains its same-origin opener isolation.

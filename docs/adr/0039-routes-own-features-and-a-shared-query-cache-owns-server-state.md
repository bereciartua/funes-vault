# 0039 — Routes own features and a shared query cache owns server state

Date: 2026-09-22

Status: accepted

## Context and problem

One large client component loaded unrelated surfaces and duplicated fetching, busy flags and cache refresh triggers.

## Decision outcome

Next route files render feature entry points under a shared authenticated shell. TanStack Query owns server data with API-origin-and-owner-scoped keys and mutation invalidation.

## Consequences

Presentation components read API context at network boundaries; owner transitions clear private cached data; route bundles isolate memory, chat and settings entry modules.

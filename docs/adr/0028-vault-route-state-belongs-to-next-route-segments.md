# 0028 — Vault Route State Belongs To Next Route Segments

Date: 2026-07-09

Status: superseded

Superseded by: [0039](0039-routes-own-features-and-a-shared-query-cache-owns-server-state.md).

## Context and problem

The initial route migration introduced real URLs but left every segment as a null stub and kept the second router inside `memory-vault.tsx`. That duplicated settings vocabulary, hid invalid settings URLs by falling back to profile, and made future route additions require edits in both the file tree and a hand-written parser.

## Decision outcome

Authenticated vault route segments render the app entry with explicit route state instead of mounting a global client shell that reparses `usePathname`. Shared route vocabulary lives in `apps/web/app/vault/routes.ts`, including surface types, settings sections, href builders, and the legacy `policies` to `clients` alias. Unknown `/settings/[section]` values now return a 404, while legacy aliases redirect to their canonical route.

## Consequences

Deep links and legacy redirects are owned by server route files, and the client shell receives a serializable route state. The large shared shell still owns cross-surface state for now; further extraction can move individual surface state into route-mounted hooks without changing URL semantics again.

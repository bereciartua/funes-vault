# 0031 — Privacy Policy Summaries Prefer Prose Over Badge Clusters

Date: 2026-07-09

Status: accepted

## Context and problem

Dense badge clusters made the app feel operationally noisy and forced users to decode multiple tokens before understanding who could read what.

## Decision outcome

Authenticated Signals surfaces express policy reach, confirmation requirements, trust, and retention as short prose with labeled color dots where a glanceable state is useful. Color is never the sole carrier of meaning.

## Consequences

Reusable prose helpers live in `apps/web/src/lib/domain/`; legacy status badges remain only where event tone or existing management forms still benefit from them.

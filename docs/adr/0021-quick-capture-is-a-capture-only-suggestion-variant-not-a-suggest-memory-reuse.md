# 0021 — Quick Capture Is A Capture-Only Suggestion Variant, Not A suggest_memory Reuse

Date: 2026-07-04

Status: accepted

## Context and problem

Quick capture is a low-friction, low-context write path — a Siri Shortcut or offline note has no LLM classification and no user attention at capture time, so letting it set kind, sensitivity, categories, or bypass review would turn the cheapest input into the least-reviewed memory. Forcing everything through the existing suggestion inbox keeps the review and audit behavior identical to other memory writes, and the secret-like content check still applies. `INTERNAL` sensitivity keeps unclassified captures out of casual disclosure until reviewed. This keeps low-context capture within owner review.

## Decision outcome

The quick-capture endpoint (`POST /v1/captures`) is a stricter capture-only variant of memory suggestions rather than a pass-through to the full `suggest_memory` request shape. It accepts raw text only; the server derives the title, fixes kind to `FACT`, applies a conservative `INTERNAL` sensitivity, and always creates a `QUEUED_FOR_REVIEW` suggestion — never a direct memory write, even when a write policy would allow one. Requests are idempotent by a client-generated `captureId` so the PWA offline queue can retry syncs safely. The endpoint accepts the web session cookie (PWA) or a registered client bearer token (OS shortcuts); client captures are gated by a SUGGEST policy with purpose `quick_capture`, while user-session captures need no policy because the user is the authority over their own vault.

## Consequences

Raw captures cannot smuggle WRITE parameters or raise sensitivity privileges. Offline queues need owner isolation and idempotent retry before the server creates a reviewable suggestion.

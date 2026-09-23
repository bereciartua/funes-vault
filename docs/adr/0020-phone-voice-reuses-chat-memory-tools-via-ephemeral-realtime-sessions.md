# 0020 — Phone Voice Reuses Chat Memory Tools Via Ephemeral Realtime Sessions

Date: 2026-07-03

Status: accepted

## Context and problem

The memory chat brain, tools, policy filtering, and audit path already exist; voice should be a new transport onto them, not a second brain. Browser-executed tool calls keep the API as the sole authority for auth, policy, retrieval, and mutation without adding a relay server. Persisting voice turns into existing threads makes text fallback the same conversation rather than a parallel mode. See the [mobile access guide](../deployment-and-operations.md#mobile-pwa-access).

## Decision outcome

Mobile voice uses the OpenAI Realtime API over WebRTC from the installed PWA. The API mints ephemeral session tokens, the browser executes tool calls against the API with its existing session auth, and voice sessions reuse the memory chat tool definitions and persist transcripts into the same chat threads. The PWA requires only a stable private HTTPS origin; no inbound public exposure.

## Consequences

The browser transmits audio to OpenAI using a short-lived credential. Tool calls still pass through authenticated API services, and persisted turns must be source-bound and deduplicated.

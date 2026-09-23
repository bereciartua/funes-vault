# 0022 — Voice Sessions Get Their Ceiling From A Dedicated First-Party Client Policy

Date: 2026-07-04

Status: accepted

## Context and problem

The voice privacy review asked whether voice needs its own sensitivity ceiling on `request_memory` results. Voice streams retrieved memory text plus raw audio to the Realtime provider and is typically used aloud in uncontrolled environments, so it is a riskier disclosure surface than the desktop chat UI.

## Considered options

(1) a hard env-gated post-filter on bundle items (like `EMBEDDINGS_MAX_SENSITIVITY`) — simple but invisible to the user and a second enforcement mechanism to maintain; (2) no ceiling — rejected, voice is a materially different disclosure channel; (3) a dedicated first-party client whose policy is the ceiling — chosen, because policies are the product's native disclosure control and the audit trail gets voice attribution for free.

## Decision outcome

Realtime voice sessions run their memory tools through a dedicated first-party client ("Funes Vault Voice", purpose `memory_voice`) instead of the web chat client. Its default policy allows READ and SUGGEST only — never direct WRITE, so every memory write from voice queues for review — and caps disclosure at `VOICE_MAX_SENSITIVITY` (default `SENSITIVE`, vs web chat's `SECRET`). The ceiling is therefore enforced by the existing policy engine, is visible and adjustable in Apps & access like any other policy, and every voice tool call is audit-attributed to the voice client. The env var only sets the default at policy creation.

## Consequences

The voice client and policy appear in Apps & access on first voice use; users can tighten or loosen the voice ceiling without redeploying; `request_memory` in voice sessions is filtered to the policy's sensitivity cap; memory writes from voice always land in the suggestions inbox.

# 0046 — Owner-selected memory processing providers

Date: 2026-09-24

Status: accepted

## Context and problem

The task-wide environment selectors in [0037](0037-configurable-memory-processing.md) chose TypeSafe or OpenAI for the entire deployment. The owner-facing TypeSafe consent controls could block processing without selecting OpenAI. They did not express which provider the owner wanted for each task.

## Decision outcome

Owners select TypeSafe or OpenAI independently for extraction and consolidation. TypeSafe extraction continues to use OpenAI normalization. Instance configuration sets the initial choice for every owner, including existing owners without a saved choice and new owners. An explicit environment selector wins; when it is absent, TypeSafe becomes the initial choice if its required credentials are present. This changes the previous OpenAI default for TypeSafe-capable instances. A saved owner choice wins over the instance default. Selecting TypeSafe activates that task directly; there is no separate TypeSafe consent toggle or automatic provider fallback.

Previously revoked TypeSafe consent migrates to an OpenAI choice. This changes the meaning of revocation: the old control could stop extraction entirely on a TypeSafe deployment, while the new selector keeps extraction running with OpenAI, which already receives chat text. The selector has no off state. The migration leaves active and absent legacy consent rows without a saved choice, so those owners inherit the instance default.

## Consequences

Provider changes are audited. New extraction runs and consolidation jobs snapshot the owner's current choice. Each provider stage and transaction rechecks that choice so work from a previous selection cannot disclose more data or commit after a switch. A failed or skipped extraction run can be explicitly reprocessed with the current choice; ordinary retry keeps its original snapshot. Consolidation scheduling, review and automatic application remain separate settings. Voice sessions track the extraction configuration independently of consolidation.

`ProcessingConsent` and `PROCESSING_CONSENT_UPDATED` remain only for historical records and audit compatibility in this release. Remove them in a later versioned migration after existing exports and audit readers no longer depend on them.

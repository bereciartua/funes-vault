# 0046 — Owner-selected memory processing providers

Date: 2026-09-24

Status: accepted

## Context and problem

The task-wide environment selectors in [0037](0037-configurable-memory-processing.md) chose TypeSafe or OpenAI for the entire deployment. The owner-facing TypeSafe consent controls could block processing without selecting OpenAI. They did not express which provider the owner wanted for each task.

## Decision outcome

Owners select TypeSafe or OpenAI independently for extraction and consolidation. TypeSafe extraction continues to use OpenAI normalization. An explicit environment selector sets the initial choice; when it is absent, TypeSafe is the initial choice if its required credentials are present. A saved owner choice wins over the initial choice. Selecting TypeSafe activates that task directly; there is no separate TypeSafe consent toggle or automatic provider fallback. Previously revoked TypeSafe consent migrates to an OpenAI choice.

## Consequences

Provider changes are audited. New extraction runs and consolidation jobs snapshot the owner's current choice. Each provider stage and transaction rechecks that choice so work from a previous selection cannot disclose more data or commit after a switch. A failed or skipped extraction run can be explicitly reprocessed with the current choice; ordinary retry keeps its original snapshot. Consolidation scheduling, review and automatic application remain separate settings. Voice sessions track the extraction configuration independently of consolidation.

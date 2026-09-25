# 0037 — Configurable memory processing

Date: 2026-09-20

Status: accepted; provider selection and consent superseded by [0046](0046-owner-selected-memory-processing-providers.md)

## Context and problem

Provider flexibility must not change permission, review or persistence semantics.

## Decision outcome

Extraction and consolidation select their processing pipelines independently. System 1 is the TypeSafe Jev classifier-led pipeline; extraction also uses OpenAI normalization. System 2 is the OpenAI LLM pipeline. The names evoke fast judgment and deliberate reasoning, not measured speed or quality guarantees.

## Consequences

At the time, task-specific, versioned TypeSafe consent and independent review overrides were authoritative, with no owner provider selector or automatic fallback. Runs snapshotted their configuration. Owner selection and the retirement of the consent control are specified by [0046](0046-owner-selected-memory-processing-providers.md). See [memory processing](../memory-processing.md) for current behavior.

Keep the existing `MEMORY_EXTRACTION_SYSTEM` and `MEMORY_CONSOLIDATION_SYSTEM` environment names and `system_1`/`system_2` values for deployment compatibility. Product copy uses provider names. TypeSafe is the vendor of the optional Jev classifier, configured with `TYPESAFE_API_KEY`; it is an external data processor.

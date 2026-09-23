# 0037 — Configurable memory processing

Date: 2026-09-20

Status: accepted

## Context and problem

Provider flexibility must not change permission, review or persistence semantics.

## Decision outcome

Extraction and consolidation select their processing pipelines independently. System 1 is the TypeSafe Jev classifier-led pipeline; extraction also uses OpenAI normalization. System 2 is the OpenAI LLM pipeline. The names evoke fast judgment and deliberate reasoning, not measured speed or quality guarantees.

## Consequences

Task-specific, versioned TypeSafe consent and independent review overrides remain authoritative. No live configuration editor or automatic fallback is provided. Runs snapshot their configuration. See [memory processing](../memory-processing.md).

Keep the existing `MEMORY_EXTRACTION_SYSTEM` and `MEMORY_CONSOLIDATION_SYSTEM` environment names and `system_1`/`system_2` values for deployment compatibility. Product copy uses provider names. TypeSafe is the vendor of the optional Jev classifier, configured with `TYPESAFE_API_KEY`; it is an external data processor.

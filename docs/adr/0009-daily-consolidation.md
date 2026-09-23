# 0009 — Daily Consolidation

Date: 2026-06-26

Status: accepted

## Context and problem

A "dreaming" process could detect explicitly expired, duplicate, conflicting, or summarizable memories. The default should be disabled and review-only, but users who explicitly opt into automatic consolidation should get a clear `AUTO_APPLY` mode where every output the worker produces is committed automatically and audited. Consolidation should focus daily work on recent consolidation-relevant changes, gather semantic and lexical candidates, and use an LLM only to adjudicate bounded candidate sets rather than scanning or rewriting the whole vault blindly. Generic row `updatedAt` must not be the daily trigger because job maintenance can move it; the worker needs its own relevant-change timestamp and inspected-version cursor. Funes maintains internal consistency, but it does not forget by age; recency can influence relevance, not retention.

## Decision outcome

Support async background jobs and user-configurable consolidation behavior.

## Consequences

Consolidation needs durable jobs, bounded provider work and inspectable proposals. Automatic application is an explicit choice with version checks and audit records.

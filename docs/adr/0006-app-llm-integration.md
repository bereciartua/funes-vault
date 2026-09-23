# 0006 — App LLM Integration

Date: 2026-06-26

Status: accepted

## Context and problem

The AI SDK gives provider flexibility for the app's memory chat and memory-question flows.

## Decision outcome

Use the Vercel AI SDK for application model calls.

## Consequences

Provider calls and stream events share SDK types. SDK upgrades require stream and tool regressions because those protocols drive privacy feedback.

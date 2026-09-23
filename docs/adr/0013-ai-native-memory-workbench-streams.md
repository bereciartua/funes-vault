# 0013 — AI-Native Memory Workbench Streams

Date: 2026-06-26

Status: accepted

## Context and problem

The workbench needs streamed assistant text and typed product state for evidence, policy decisions, provider disclosure, tool traces, audit references, and memory suggestions. Typed stream data avoids scraping assistant prose for privacy-critical UI state. The API remains the authority for auth, user scoping, policy evaluation, retrieval, memory mutation, and persistence. Streamed tool visibility should be sanitized so model-facing memory snippets are not duplicated into browser-visible tool output chunks.

## Decision outcome

Use AI SDK UI message streams for the authenticated memory workbench while preserving the existing JSON chat endpoint.

## Consequences

The browser must retain typed stream parts across cache refreshes. Assistant prose alone cannot prove that a disclosure or write succeeded.

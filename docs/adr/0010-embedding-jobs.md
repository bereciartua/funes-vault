# 0010 — Embedding Jobs

Date: 2026-06-26

Status: accepted

## Context and problem

Embedding calls should not block memory writes, and job status should be visible through `JobRun` records and audit metadata. Redis is an acceptable local and self-hosted dependency for this async path.

## Decision outcome

Use BullMQ with Redis for embedding generation jobs.

## Consequences

Redis becomes an operational dependency for background queues. Memory persistence must remain independent of provider latency, and readiness must expose queue outages.

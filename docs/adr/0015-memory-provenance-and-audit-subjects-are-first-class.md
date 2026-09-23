# 0015 — Memory Provenance And Audit Subjects Are First-Class

Date: 2026-07-01

Status: accepted

## Context and problem

Controlled memory sharing depends on explainability. Raw JSON metadata can preserve compatibility, but it is too brittle as the only way to answer which memory, suggestion, job, request, client, or policy caused a change. Tenant-scoped subject rows let Vault, Inbox, Jobs, and Audit render direct links while minimizing copied sensitive content.

## Decision outcome

Memory lifecycle history uses append-only `MemoryProvenanceEntry` rows, and audit events use typed `AuditEventSubject` rows for affected records. UI surfaces should prefer these typed subjects over ad hoc metadata parsing.

## Consequences

Mutations and provenance must commit together. Typed subject IDs support navigation after renames, while labels preserve readable history without copying entire memory bodies.

# 0040 — A fresh release starts from one migration baseline

Date: 2026-09-22

Status: accepted

## Context and problem

Unreleased incremental migrations and demo seeding should not be prerequisites for a new installation.

## Decision outcome

The initial public database starts with one baseline migration containing pgvector, the cosine HNSW index and built-in categories.

## Consequences

An existing private database needs an explicit operator migration/reset strategy. Never apply the baseline to an old vault and assume its prior migration history is compatible. Later public changes use additive migrations.

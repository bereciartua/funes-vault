# 0003 — First Storage Engine

Date: 2026-06-26

Status: accepted

## Context and problem

Postgres works for local Docker Compose, self-hosted, and hosted deployments. Prisma provides a schema and migration source of truth.

## Decision outcome

Use PostgreSQL with Prisma for persistent storage.

## Consequences

Operators must run PostgreSQL and apply migrations. Prisma supplies generated types, while pgvector indexes still require reviewed SQL.

# 0038 — Build packages through TypeScript project references

Date: 2026-09-22

Status: accepted

## Context and problem

Resolving one package directly into another package's source bypassed the package boundary and made clean builds unreliable.

## Decision outcome

Workspace exports resolve to built JavaScript and declaration files. The root typecheck generates Prisma and Next route types, then uses TypeScript project references.

## Consequences

Development builds packages before watchers start; production builds exclude tests and deploy only runtime dependencies.

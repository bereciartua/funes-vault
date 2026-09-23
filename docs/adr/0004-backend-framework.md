# 0004 — Backend Framework

Date: 2026-06-26

Status: accepted

## Context and problem

NestJS gives the backend a modular TypeScript structure for auth, policy, memory, MCP, audit, embeddings, and background jobs.

## Decision outcome

Use NestJS for the API.

## Consequences

Use cases live in Nest modules with injectable collaborators. Framework wiring adds ceremony but lets integration tests replace external providers.

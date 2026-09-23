# 0001 — Prototype Deployment

Date: 2026-06-26

Status: accepted

## Context and problem

The system should run locally, but it should not be architected as single-user-only. Hosted and self-hosted deployments both need multi-user support, authentication, and per-user memory vault boundaries.

## Decision outcome

Build a locally self-hostable, multi-user prototype.

## Consequences

Every user-owned row needs an owner boundary even in a local installation. Deployment stays simple, but tests and authentication must cover more than one account.

# 0019 — OCI Images And Compose-Shaped Config Are The Packaging Contract

Date: 2026-07-03

Status: accepted

## Context and problem statement

Self-hosted installations need reproducible API, worker, web and MCP runtimes without requiring the operator to build the monorepo on the server. Configuration must be explicit and portable between container managers.

## Decision outcome

Server deployments consume the same published API, web, and MCP images and environment configuration. The web app is also the installable phone client. See the [operations guide](../deployment-and-operations.md).

## Consequences

Images must contain runnable production dependencies and migrations. The same environment contract must work in Compose and other container managers; publishing images remains a release operation.

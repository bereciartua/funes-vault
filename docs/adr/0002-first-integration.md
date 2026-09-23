# 0002 — First Integration

Date: 2026-06-26

Status: accepted

## Context and problem

HTTP keeps the core service simple, while MCP makes the memory layer accessible to tool-aware agents. MCP is a first-version requirement.

## Decision outcome

Expose an HTTP API and an MCP server.

## Consequences

The API owns policy and persistence. MCP adapts those contracts and cannot implement a separate authorization path.

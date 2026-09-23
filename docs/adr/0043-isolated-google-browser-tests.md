# 0043 — Isolated Google browser tests

Date: 2026-09-22

Status: accepted

## Context and problem

The older production web smoke harness depended on demo login and could not exercise Google login, consent redirects or production CSP.

## Decision outcome

Build Next in CI and start an isolated API test executable whose Google provider is overridden through dependency injection. Tests own both listeners and never reuse a developer server.

## Consequences

This supersedes ADR 0027’s test identity setup. Production code has no fake-provider switch; separate demo tests run the real development API. Failures upload Playwright traces.

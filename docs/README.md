# Documentation

Start with the [project overview](../README.md). Terms used throughout the product
are defined in the [glossary](glossary.md).

## Using the vault

- [Vision](vision.md) — read this for the problem, product goals, user stories and non-goals.
- [Memory model](memory-model.md) — read this to understand kinds, sensitivity, lifecycle and provenance.
- [Privacy and trust](privacy-and-trust-model.md) — read this before deciding what to store and disclose.
- [Memory processing](memory-processing.md) — read this to understand extraction, consolidation and processor permissions.

## Operating a deployment

- [Deployment and operations](deployment-and-operations.md) — install, configure, upgrade, back up and use the PWA/voice client.
- [Google sign-in](google-sign-in.md) — configure the identity provider, canonical origins and callbacks.
- [Threat model](threat-model.md) — understand current defenses, residual risks and future hosted-mode controls.
- [Security policy](../SECURITY.md) — report a vulnerability privately.

## Connecting an AI tool

- [MCP integration](mcp-integration.md) — connect through stdio or Streamable HTTP and OAuth.
- [API guide](api-guide.md) — understand authentication, errors, pagination and tool-to-endpoint mapping.
- [OpenAPI specification](openapi.json) — inspect the generated HTTP contract; running servers expose `/docs` and `/openapi.json`.
- [LLM integration](llm-integration.md) — understand the provider boundary and first-party memory tools.

## Contributing

- [Contributing](../CONTRIBUTING.md) — set up the workspace, run checks and submit a change.
- [Architecture](../ARCHITECTURE.md) — understand services, modules and key sequences.
- [Database schema](database-schema.md) — inspect ownership, constraints and the generated ER diagram.
- [Architecture decisions](adr/README.md) — read the rationale and superseded alternatives.
- [Testing and release](testing-and-release.md) — choose the right test tier and verify a release.
- [Release runbook](releasing.md) — choose versions, prepare/review releases, publish automatically and recover failures.
- [Changelog](../CHANGELOG.md) — review released capabilities and limitations.

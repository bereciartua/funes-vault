# Changelog

All notable changes are documented here, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and Semantic Versioning.

## [Unreleased]

## [1.1.0] - 2026-09-24

This release uses a minor version by explicit maintainer decision while the vault is not yet in production. It includes the incompatible changes below; the exception applies only to this release.

### Added

- Agent release runbook and compatibility policy, synchronized version preparation,
  and CI-gated tagging, container publication and GitHub Releases. Production
  deployment remains a separate operation.

### Changed

- **Breaking:** one App permissions set per authenticated client; optional purpose is audit context only.
- Check app authority before retrieval, report typed decision reasons, audit denials and bind approvals to policy versions.
- **Breaking:** MCP inputs accept only camelCase fields and uppercase enum values; snake_case aliases, `categories`, and lowercase kinds are rejected. HTTP input aliases remain supported.
- **Breaking:** HTTP policy bodies no longer accept `purpose`, updates cannot change `clientId`, and a second permission set for a client returns 409. Client responses replace `policyCount` with `hasPolicy`; disclosure review responses replace `purpose` with nullable `statedPurpose`. Read, suggestion and capture responses expose typed decision reasons.
- Expose described MCP schemas without purpose hints or retry; isolate caller suggestion metadata from server actions.
- Show resulting OAuth permissions, never silently recreate removed first-party permissions and offer explicit default restoration.
- Add the additive app-permissions migration and export v2; old exports and pre-migration approvals are not compatible.

### Removed

- Purpose-based policy selection, MCP purpose substitution and v1 export import compatibility. See the [migration guide](docs/deployment-and-operations.md#app-permissions-migration) before upgrading.
- MCP `suggestedPurpose` configuration and the `FUNES_VAULT_SUGGESTED_PURPOSE` hint/retry behavior. Purpose no longer grants access.

### Migration notes

1. Drain pending device capture queues and take a verified database backup. Old bearer-capture identifiers no longer deduplicate after migration, so retries can create duplicates. A v1 JSON export cannot be imported into this release and is not a substitute for the rollback database backup.
2. Stop the old API, worker, MCP and web services. Select matching 1.1.0 images and run the migration service before starting the new services together. Never run the old and new authorization models against the same database schema.
3. The migration removes invalid cross-owner policies and keeps only the newest valid policy per client, ordered by `updatedAt` and then id. It discards surplus policies and their purpose field. Review every app's surviving permissions after upgrading.
4. Existing requests keep their stated purpose but lose approval authority: deny old requests and submit fresh ones. Accounts, sessions, clients and OAuth grants remain valid. Caller-provided suggestion metadata moves under `caller`; server-owned manual-capture, chat and consolidation metadata retain their shape.
5. Update MCP integrations to the advertised camelCase fields and uppercase enums, update HTTP clients for the response and policy changes above, and create new v2 exports after upgrading. Verify API/web/MCP readiness, worker heartbeat, app permissions and disclosure/revocation flows.

Rollback requires stopping the new services, restoring the pre-upgrade database backup and restarting matching 1.0.0 images. Reverting images alone is insufficient; never reset a personal or deployed vault. See the [operator procedure](docs/deployment-and-operations.md#app-permissions-migration).

## [1.0.0] - 2026-09-23

### Added

- Self-hosted personal memory vault with Google sign-in, categorized memories, sensitivity, provenance, review and account controls.
- Purpose-scoped client policies, exact selected disclosure previews, single-use approval and auditable retrieval.
- MCP stdio/HTTP tools and OAuth authorization-code flow with PKCE, refresh rotation, replay detection and revocation.
- Text chat, Realtime voice, citations, processing permissions, durable extraction outcomes and review-first consolidation.
- Responsive PWA with owner-scoped offline text capture, suggestions inbox, jobs, linked audit provenance and export/import preview.
- Secure browser sessions, nonce-based script CSP, explicit processing consent, secret-like content rejection and transactional disclosure auditing.
- Production images for API/worker, web and MCP, generated API/schema documentation, and privacy integration and browser checks.

### Migration notes

This is the first public release. The single baseline replaces development migration history; existing development databases require export/backup and recreation using the [migration procedure](docs/deployment-and-operations.md).

- Production website authentication requires Google configuration; seeded demo login is development-only.
- Consolidation similarity and keyword retrieval share Unicode tokenization. Accented and non-Latin words participate in matching; filler alone does not establish similarity. The lexical candidate threshold is 0.34.
- Offline captures are scoped to a vault URL and owner. After signing in once, the device remembers the owner ID so text capture can reopen offline. Sign-out or session expiration removes that hint. Sync requires a valid session for that same owner; legacy unscoped queues are not automatically imported.
- Consolidation replaces the development `POST /v1/data/expiration-runs` route and handles expiration in review or automatic mode. Retrieval excludes elapsed expiration dates.
- The web PWA replaces development browser-extension and native-mobile build targets.

See the [testing guide](docs/testing-and-release.md) for verification commands and the [operations guide](docs/deployment-and-operations.md) for deployment prerequisites. Publication and production rollout remain operator actions.

[Unreleased]: https://github.com/bereciartua/funes-vault/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/bereciartua/funes-vault/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/bereciartua/funes-vault/releases/tag/v1.0.0

# Agent guidance

Funes Vault is a self-hosted personal memory service. Its central promise is
controlled, auditable disclosure of the owner's context to AI tools.

## Read first

- [CONTRIBUTING.md](CONTRIBUTING.md): setup, branches, checks and documentation rules.
- [ARCHITECTURE.md](ARCHITECTURE.md): service boundaries, data flows and build model.
- [Privacy model](docs/privacy-and-trust-model.md): guarantees and their tests.
- [Database reference](docs/database-schema.md): ownership and migrations.
- [ADRs](docs/adr/README.md): accepted decisions and superseded approaches.
- [Testing guide](docs/testing-and-release.md): test layers and external dependencies.

## Architecture

- Scope all user-owned reads and writes by `userId`, including nested subjects.
- Authenticate every route that reads or changes private data.
- Keep controllers thin; services own use cases and repositories own query shapes.
- Write audit events only through `AuditTrailService`; `AuditService` is read-only.
- Persist mutations, provenance and associated audit records transactionally.
- Use shared Zod contracts for API, web and MCP boundaries.
- Keep the HTTP-free worker dependency graph separate from `AppModule`.
- Provider calls run outside database transactions; revalidate authority on commit.
- Shared package exports resolve through built declarations and JavaScript.
- Preserve source version checks, single-use claims and idempotency on retries.
- Keep source files below 400 lines, except generated code and pure data tables.

## Privacy review

For each change, establish:

- Which owner and client can read or modify the affected records?
- Could an identifier, relation, cache or background job cross a tenant boundary?
- Does external disclosure create an audit event?
- Does the owner need an exact preview or confirmation?
- Which third-party processor receives which data, under which permission?
- Can the owner inspect, revoke, correct, export or delete the result?

Unknown clients fail closed. Secret-like content must not become durable memory.
Sensitive context requires the applicable policy and processing permission.
Consolidation defaults to disabled and review-only; automatic application is an
explicit user setting and remains audited. Do not turn provider prose into proof
that a memory was saved.

## API

- Use Nest modules, controllers and injectable services in `apps/api/src`.
- Validate JSON input with `ZodValidationPipe` at controller boundaries.
- HTML OAuth forms use explicit parsing and escaped HTML responses.
- Read deployment settings through the cached `apiEnv()` validator.
- Use `SessionsService` for browser-session resolution, including OAuth/dashboard.
- Errors use the common envelope; never echo input values, tokens or provider bodies.
- Opaque credentials are stored as hashes. Document exceptional short-lived
  protocol material, such as the Google PKCE verifier, and its cleanup.
- Keep Swagger DTOs and decorators aligned with runtime schemas.
- Regenerate `docs/openapi.json` after contract changes.

## Web

- App Router files in `apps/web/src/app` own their feature surfaces.
- `VaultShell` owns the sole authenticated `main` landmark.
- Read API origin from context; use query hooks and scoped query keys for data.
- Invalidate affected queries after mutations and clear private caches on logout.
- Use shared primitives, accessible names, live feedback and confirmation dialogs.
- Use semantic CSS and design tokens; follow [style conventions](apps/web/src/styles/README.md).
- Keep responsive rules with their owner; use real routes rather than a second router.
- Add Testing Library tests for interactions and Playwright checks for changed flows.
- Keep implementation details out of product copy unless needed for a user decision.

## Database and verification

- Prisma schema and migrations live in `packages/db/prisma`.
- Generate the client; never commit `packages/db/src/generated` or build output.
- Use migrations for schema changes and retain the SQL-managed pgvector HNSW index.
- Never reset a development or deployed vault to run tests; use a disposable `*_test` database.
- Keep seed data synthetic and demo-only.
- Run relevant checks from CONTRIBUTING and update affected docs in the same change.
- Ordinary tests must not use live providers, personal data or the host microphone.

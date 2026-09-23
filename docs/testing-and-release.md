# Testing and release

Use Node 24 and the commands in [CONTRIBUTING](../CONTRIBUTING.md). Tests use
synthetic accounts, memories and provider responses. The ordinary suites do not
contact live AI providers or capture the host microphone.

## Test pyramid

Counts are approximate and grow with coverage; the test runner reports the exact
count for a revision. Do not run two database-mutating suites against one test DB.

| Layer              | Location                                         | Command              | External dependencies                                         | Approximate count             | CI                                      |
| ------------------ | ------------------------------------------------ | -------------------- | ------------------------------------------------------------- | ----------------------------- | --------------------------------------- |
| Unit and component | `apps/api/src`, `apps/web/src`, `packages/*/src` | `pnpm test`          | None; providers/DB mocked                                     | Runner-reported               | Yes, separate web/packages and API jobs |
| API integration    | `apps/api/test/*.e2e.spec.ts`                    | `pnpm test:e2e`      | Disposable PostgreSQL; Redis for queue checks                 | Runner-reported               | Yes                                     |
| Privacy umbrella   | Tagged `privacy:` unit/integration suites        | `pnpm test:privacy`  | Disposable PostgreSQL and Redis                               | Subset of the two tiers above | Yes; not a second copy of all tests     |
| Browser smoke      | `e2e/`                                           | `pnpm test:e2e:web`  | PostgreSQL, Redis, Chromium, compiled fake-Google API         | About a dozen flows           | Yes; production Next build              |
| Development demo   | `e2e-demo/`                                      | `pnpm test:e2e:demo` | Seeded disposable PostgreSQL, Redis, Chromium                 | 1 flow                        | Yes; real API in development mode       |
| Live voice         | `e2e-live/`                                      | `pnpm test:e2e:live` | Explicit synthetic WAV, paid provider credentials and test DB | 1 integration flow            | No; opt-in only                         |

Vitest uses a Node environment for pure web `.test.ts` tests and jsdom for component
`.test.tsx` tests. Shared setup supplies cleanup and missing browser APIs. Fetch
route tables reject unexpected requests. Query wrappers create a fresh cache per
test. Fixtures describe actual shared contracts. API test mocks use Nest dependency
injection; integration tests exercise real transactions and locks.

## Prepare a test database

Start the local Compose dependencies, then run:

```sh
pnpm test:e2e:setup
```

The setup script creates, migrates and seeds `funes_vault_test`. Override
`TEST_DATABASE_URL` to select another disposable database ending in `_test`.
Integration tests truncate owned tables and reseed categories between cases;
never point them at a development or deployed vault.

```sh
TEST_DATABASE_URL=postgresql://funes_vault:funes_vault@localhost:5432/funes_vault_test \
E2E_REDIS_URL=redis://localhost:6379 pnpm test:e2e

DATABASE_URL=postgresql://funes_vault:funes_vault@localhost:5432/funes_vault_test \
REDIS_URL=redis://localhost:6379 pnpm test:e2e:web

DATABASE_URL=postgresql://funes_vault:funes_vault@localhost:5432/funes_vault_test \
REDIS_URL=redis://localhost:6379 pnpm test:e2e:demo
```

Browser suites own both listeners and use `reuseExistingServer: false`. They compile
the isolated test API with a DI-overridden Google provider; no production setting
selects that provider. Local runs start Next development mode. CI builds Next first
and starts the production output. Demo tests instead start the real API with exactly
`NODE_ENV=development` and no Google/provider keys. Traces are retained on failure;
CI retries a failed browser case once. Use `PLAYWRIGHT_WEB_PORT`/`PLAYWRIGHT_API_PORT`
and matching `PLAYWRIGHT_WEB_URL`/`PLAYWRIGHT_API_URL` when defaults are occupied.

Processing-consent browser tests reset consent through the API in `beforeEach`.
They do not depend on the previous test's persisted toggle state. Screenshots for
failure diagnosis belong in Playwright artifacts, not hard-coded `/tmp` paths.

## Coverage and static checks

```sh
TEST_DATABASE_URL=postgresql://funes_vault:funes_vault@localhost:5432/funes_vault_test pnpm test:coverage
pnpm format:check
pnpm typecheck
pnpm lint
pnpm lint:css
pnpm lint:unused
pnpm build
pnpm db:check-migrations
pnpm docs:openapi
pnpm docs:erd
```

API and web V8 coverage is thresholded and retained in CI artifacts. Coverage
API coverage combines units with privacy integration and requires the disposable database. Explicit per-directory floors protect auth, OAuth, policies, sharing requests and audit writes; meaningful assertions about authority,
concurrency, cache invalidation and cleanup matter more than exercising a line.
CI runs static checks, unit, privacy, remaining API integration, browser, build and
dependency audit jobs separately. Schema validation and formatting run in static checks. Migration drift runs in
API integration CI against a separate shadow database. Generated OpenAPI/ER changes must be reviewed.

## Live provider verification

This is a paid opt-in test, separate from ordinary browser discovery:

```sh
LIVE_VOICE_AUDIO_FILE=/absolute/path/synthetic.wav \
OPENAI_API_KEY=your_test_key \
DATABASE_URL=postgresql://funes_vault:funes_vault@localhost:5432/funes_vault_test \
REDIS_URL=redis://localhost:6379 pnpm test:e2e:live
```

Use a synthetic recording with a clear remember request and leading/trailing silence.
Chromium reads the WAV as its microphone. The test checks structural persistence,
processing status and durable result links rather than exact model wording. It
revokes its extraction consent afterward. To exercise the TypeSafe Jev classifier,
set the task selector and credentials described in [memory processing](memory-processing.md).
Physical-device installation, microphone acoustics and provider quality still need
separate evaluation. Never use a personal recording or vault as a smoke fixture.

## Release verification

Verify a clean dependency install, clean package-output typecheck, full tests and
builds. Apply the single initial baseline to a fresh database, check drift, and
confirm PostgreSQL can use the HNSW cosine index. Build all three Docker targets,
check non-root users and runtime contents, and exercise migrations, API/web/MCP
health and worker heartbeat. Test desktop/mobile layouts, light/dark themes, auth,
disclosure/revocation, offline capture and exported data boundaries.

The README quickstart must work with Node 24, pnpm and Docker alone. Live-provider
and physical-device checks are explicitly separate; record which were run rather
than implying mocks prove provider quality. Release notes belong in
[CHANGELOG](../CHANGELOG.md). Publishing images, creating a release, selecting public
origins and changing repository visibility remain maintainer release operations.

### Coverage reports

The unit and privacy jobs publish coverage tables in their GitHub job summaries
and retain downloadable HTML/LCOV artifacts for 14 days. Codecov additionally
receives uploads when the repository has a valid `CODECOV_TOKEN` (or has enabled
tokenless public uploads). Missing external-service configuration does not hide
the CI artifacts or disable the local coverage thresholds.

### CodeQL reports

CodeQL scans pull requests and retains SARIF artifacts. Public repositories upload
findings to GitHub code scanning; private repositories can opt in with the
`CODEQL_UPLOAD` variable after enabling the service. Review and dismiss false
positives in GitHub with a written rationale; source fingerprints are not a local
suppression mechanism. An active branch ruleset must require CodeQL results and
block high/critical security alerts before merge.

### Publication checklist

- Enable GitHub code scanning and private vulnerability reporting before making
  the security policy's reporting link the public contact path.
- Enable an active main-branch ruleset requiring CodeQL, high/critical security
  alerts resolved, passing CI and pull-request review. Inspect any credential-hash
  alerts against the current code and dismiss only justified false positives in
  GitHub's native alert UI.
- Configure Codecov uploads before adding a coverage badge; CI HTML/LCOV artifacts
  remain available independently.
- Run `scripts/smoke-production.sh` using the three `funes-*:ci` images. It uses
  isolated volumes, runs the image's actual migration command, waits for worker
  heartbeat and probes API/web/MCP readiness. It then verifies API boot/readiness, worker startup deadlines with Redis unavailable, and graceful MCP shutdown.

At the September 22 review, GitHub returned 403 for both code-scanning alerts and
rulesets on this private repository's plan. Native dismissals and rule activation
must be verified after the repository becomes eligible; a successful artifact-only
scan does not imply those hosted protections are active.

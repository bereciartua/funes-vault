# Contributing to Funes Vault

Funes Vault keeps personal context under its owner's control. Changes must preserve
tenant isolation, explicit processing provider choices, revocation and auditable disclosure.
Start with [the architecture](ARCHITECTURE.md) and [the privacy model](docs/privacy-and-trust-model.md).

## Set up

Use Node 24 (see `.nvmrc`), pnpm through Corepack, and Docker. Node 25 has caused
Prisma support warnings and Nest watch-process problems; switch to Node 24 before debugging them.

```sh
corepack enable
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open `http://localhost:3000`, select **Sign in**, then **Use demo account**. The demo
login only works with the development server and the seeded, unlinked demo account.
See [Google sign-in](docs/google-sign-in.md) for personal accounts. Provider keys
are optional for ordinary vault work; live chat, embeddings and voice require them.

## Branches and pull requests

The repository follows a git-flow style model with two long-lived branches.
`develop` is the default branch and the integration line: work in `feat/`, `fix/`,
`docs/` or `chore/` branches off `develop` and open a focused pull request against
it. Use a conventional commit subject such as `fix(auth): reject expired sessions`.
Feature pull requests are squash-merged.

`main` is the production line and only ever advances by a pull request from
`develop` (or a `hotfix/` branch), merged with a merge commit, and each merge is
tagged `vX.Y.Z` after the changelog entry is finalized. The Release workflow waits
for successful push CI on the exact `main` merge, validates the prepared release,
then tags, publishes images and creates the GitHub Release. Follow the
[release runbook](docs/releasing.md), including its autonomous compatibility policy;
tag pushes alone do not publish. Merge `main` back into `develop` with a merge
commit after every release, including hotfixes. Both
branches require the CI checks to pass and a pull request; neither accepts
force pushes.

Separate behavior changes from broad moves when possible. Include the problem,
the resulting behavior, and relevant validation in the PR description. Do not
include credentials, personal vault exports, recordings or generated build output.
Run `pnpm exec simple-git-hooks` after installing if the local pre-commit hook is
missing; staged code is checked with ESLint and Prettier.

## Verification

```sh
pnpm format:check
pnpm typecheck
pnpm lint
pnpm lint:css
pnpm lint:unused
pnpm test
pnpm build
```

For API changes, prepare a disposable database and run integration tests:

```sh
pnpm test:e2e:setup
TEST_DATABASE_URL=postgresql://funes_vault:funes_vault@localhost:5432/funes_vault_test pnpm test:e2e
```

For web flows, use the seeded disposable database:

```sh
DATABASE_URL=postgresql://funes_vault:funes_vault@localhost:5432/funes_vault_test REDIS_URL=redis://localhost:6379 pnpm test:e2e:web
DATABASE_URL=postgresql://funes_vault:funes_vault@localhost:5432/funes_vault_test REDIS_URL=redis://localhost:6379 pnpm test:e2e:demo
```

`TEST_DATABASE_URL=... pnpm test:coverage` measures unit suites plus API privacy integration checks using a disposable test database. `pnpm test:privacy` selects privacy
checks across unit and integration projects and requires `TEST_DATABASE_URL`.
The [testing guide](docs/testing-and-release.md) defines the test layers, external
dependencies and opt-in live-provider checks. Do not run live-provider tests in ordinary CI.

## Documentation and contracts

Update documentation in the same PR when behavior, setup, architecture, API shape,
schema or privacy posture changes. Keep shared Zod contracts, OpenAPI and runtime
validation aligned. Use migrations for schema changes; never remove the SQL-managed
HNSW index from generated migration output. Run `pnpm db:check-migrations`. Regenerate HTTP contracts with `pnpm docs:openapi`
and schema diagrams with `pnpm docs:erd`; commit reviewed generated changes.

When a change touches user data, explain its ownership boundary, disclosure policy,
audit trail, third-party processing, and how the owner can inspect or revoke it.
Report vulnerabilities privately using [SECURITY.md](SECURITY.md).

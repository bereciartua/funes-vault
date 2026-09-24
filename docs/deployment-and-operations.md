# Deployment and operations

The supported package is a server with web/PWA and MCP access. Production uses
three OCI images: API (also worker and migrations), web and MCP. One canonical
`docker-compose.prod.yml` works with built or prebuilt images; the HTTPS override
adds Caddy. The server can read stored data, so host and backup access matter.

## Migration baseline

The initial public release has one baseline migration. It installs pgvector, the
1,536-dimension HNSW cosine index and eight built-in categories. Demo seeding is
not required for a production account.

Databases created from the earlier private migration chain are not compatible with
the new migration history. Back up/export needed data and explicitly recreate that
database before applying the baseline. Do not mark it applied to an old schema.
Never reset a real vault as a routine upgrade. After the initial public baseline,
new releases use additive migrations and documented upgrade steps.

## Configure a deployment

```sh
cp .env.production.example .env.production
```

Replace template values, set a strong `POSTGRES_PASSWORD`, and configure Google
Web application credentials using [Google sign-in](google-sign-in.md). Production
uses Google identity; **Use demo account** exists only in development mode.

Choose stable, related subdomains for the web and API so `SameSite=Lax` session
cookies work. Configure the connector origin separately:

| Setting                                        | Example                                                  |
| ---------------------------------------------- | -------------------------------------------------------- |
| `APP_DOMAIN`, `APP_URL`                        | `vault.example.com`, `https://vault.example.com`         |
| `API_DOMAIN`, `API_URL`, `NEXT_PUBLIC_API_URL` | `vault-api.example.com`, `https://vault-api.example.com` |
| `MCP_DOMAIN`, `OAUTH_ISSUER_URL`               | `connect.example.com`, `https://connect.example.com`     |
| `MCP_ALLOWED_HOSTS`                            | `connect.example.com`                                    |
| `GOOGLE_REDIRECT_URI`                          | `https://vault-api.example.com/auth/google/callback`     |

Compose derives `DATABASE_URL` from the Postgres variables, so the configured
password must be URI-safe (for example a sufficiently long randomly generated
hexadecimal value). Custom deployments can instead supply a percent-encoded
connection URL. Postgres and Redis stay on the internal container network.

Provider keys are optional for ordinary vault CRUD. OpenAI-backed chat, embeddings
and voice need `OPENAI_API_KEY`. The optional TypeSafe Jev memory classifier has
separate configuration and permission; see [memory processing](memory-processing.md).
Secrets stay in operator-controlled environment/secret storage, not browser bundles.

## Start with Compose

Build locally, then start:

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml -f docker-compose.https.yml build
docker compose --env-file .env.production -f docker-compose.prod.yml -f docker-compose.https.yml up -d
```

The services are postgres, redis, migrate, api, worker, web, mcp, and (with the HTTPS
override) proxy. `migrate` exits successfully before API and worker start; that
stopped one-shot container is expected. Sign in with Google to create your vault.
Do not seed demo data into a production deployment.

Backend host ports bind to loopback by default. The HTTPS proxy is the public entry
point. Allow certificate issuance and HTTPS traffic at the edge. With an existing
proxy, omit the HTTPS override and implement the same routing boundaries.

## Prebuilt images and upgrades

Published images use these names:

- `ghcr.io/bereciartua/funes-vault-api`
- `ghcr.io/bereciartua/funes-vault-web`
- `ghcr.io/bereciartua/funes-vault-mcp`

Set `FUNES_VAULT_IMAGE_REPO=ghcr.io/bereciartua/funes-vault` and pin
`FUNES_VAULT_IMAGE_TAG` to a published release such as `1.0.0`. The compose source
build default is `local`. A `v1.0.0` release tag publishes `1.0.0`, `1.0` and a
commit-derived tag; `latest` is only produced for default-branch publication.
Use matching image versions, or pin exact digests in a reviewed deployment file.

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --no-build
```

Back up first, review migrations, run the one-shot migration and check health after
upgrading. Binary rollback is only safe if the previous binary supports the migrated
schema. Images run as non-root and contain runtime dependencies; release builds
include provenance and an SBOM.

The web image reads `PUBLIC_API_URL` at request time. Compose derives it from
`NEXT_PUBLIC_API_URL`; custom stacks must pass that alias too. This avoids baking
one deployment's API origin into a reusable image. The web CSP limits scripts,
frames and embeds, while allowing HTTP(S)/WS(S) connections for runtime API origins.
Operator reverse-proxy rules and API CORS still constrain the served deployment.

## Portainer and home-lab hosts

Use `docker-compose.prod.yml` as the canonical stack definition, configure its
variables in Portainer, and select a published image tag. Pre-pull the images or
choose image deployment without building on the host. No separate Portainer file
needs to be kept in sync. If using Git repository deployment, select the release
ref you intend to run rather than assuming the current default branch.

An existing proxy can reach services on the stack network, or use intentionally
published backend ports on a protected interface. Keep database and Redis ports
private. On Proxmox, run this Docker stack inside a separately maintained Docker
host (for example a VM); hypervisor backups supplement application-consistent
PostgreSQL backups rather than replacing restore tests.

## Public HTTPS routing

`deploy/Caddyfile` defines the exact allowlists:

| Origin    | Routes                                                                              | Backend    |
| --------- | ----------------------------------------------------------------------------------- | ---------- |
| Web       | Website and static assets                                                           | `web:3000` |
| API       | `/auth/*`, `/oauth/consent*`, `/v1/*`, `/health`, `/.well-known/*`                  | `api:4000` |
| Connector | `/mcp`, `/mcp/*`                                                                    | `mcp:4100` |
| Connector | `/.well-known/*`, `/authorize`, `/token`, `/register`, `/revoke`, `/oauth/consent*` | `api:4000` |

Unmatched API/connector routes return 404. Swagger, readiness and queue administration
remain operator-only. Google callbacks stay on the canonical API origin; connector
consent redirects there to share its browser session. Chat and MCP proxy responses
are unbuffered. The API trusts one reverse-proxy hop; keep backend access private
and review that setting if adding another proxy.

After changing proxy configuration:

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml -f docker-compose.https.yml exec proxy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

Verify login, authenticated cross-origin API calls, discovery, OAuth consent and
revocation from outside the server network. Confirm `/admin/queues`, `/docs`,
readiness and database ports are not public. Public DNS, certificates, vendor
connector callbacks and physical phone behavior depend on the chosen deployment.

## Worker, MCP and health

API uses `JOB_WORKER_ENABLED=false`; the HTTP-free worker uses `true`. Both receive
identical processing settings. Worker health checks a heartbeat file whose age must
stay below 60 seconds. Redis schedules embedding/consolidation work; PostgreSQL
holds durable job state. Avoid duplicating workers accidentally when running API
and a separate worker. A small development instance may run workers inside API.

Run one MCP HTTP instance. Its sessions and rate limits are in memory. The
pre-authentication limit uses the socket peer, ignoring untrusted forwarded headers;
clients behind one proxy share that budget. Apply a client-IP limiter at the trusted
edge as well. The listener enforces a 1 MiB body limit, token-bound sessions, Host
and Origin allowlists, idle expiry and 30-second API timeouts. Failures reach its
`onError` hook, which logs to stderr by default.

Internal health endpoints:

- API: `/health/live` and `/health/ready` (database and configured queues).
- Browser connectivity: API `/health`, deliberately minimal and public.
- Web: `/api/health`, which omits the API origin in production.
- MCP: `/healthz`.
- Worker: configured `WORKER_HEARTBEAT_FILE`.

Queue UI is disabled unless `BULL_BOARD_ENABLED=true`, requires an `ADMIN`/`OWNER`
session and must remain private. JSON logs redact credentials and sensitive auth
query/header material; use request IDs to correlate sanitized errors.

## Configuration reference

`.env.production.example` and `apps/api/src/config.ts` define the deployment
contract. Invalid URLs, enums, boolean strings and numeric limits fail validation
at startup. Accepted boolean spellings are `true/1/yes` and `false/0/no`.

Key groups include database/Redis URLs; Google credentials and canonical origins;
job worker/dashboard flags and consolidation cron; OpenAI chat/embedding/Realtime
models and deadlines; embedding sensitivity; voice duration, idle and daily caps;
MCP Host/Origin allowlists; OAuth TTL/registration limits; and the independently
selected memory-processing tasks. `VOICE_MAX_SENSITIVITY` sets the initial voice
client policy, not an override of later user edits. Lower provider sensitivity
ceilings before processing data you do not want sent to those providers.

## Memory processing rollout and rollback

1. Deploy matching API/worker code and apply compatible migrations.
2. Select tasks independently. `system_2` uses OpenAI; `system_1` uses the TypeSafe
   Jev classifier (plus OpenAI normalization for extraction).
3. Start with review overrides, compare sanitized configuration fingerprints on
   API and worker, then enable task-specific TypeSafe permission where intended.
4. Inspect missed claims, rejected candidates, incorrect saves and latency before
   widening automatic-write policies. Provider selection does not grant permission.
5. To roll a task back, select its prior configuration, restart API/worker and
   reconnect active voice sessions. Existing runs retain their snapshots; only
   eligible explicit reprocessing adopts a new snapshot. Accepted outcomes remain.

The full [processing guide](memory-processing.md) explains consent, retries and
reconciliation. Config rollback is distinct from binary/schema rollback.

## Backup and restore

Create a PostgreSQL custom-format dump:

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --file=/tmp/funes-vault.dump'
docker compose --env-file .env.production -f docker-compose.prod.yml cp postgres:/tmp/funes-vault.dump ./funes-vault.dump
```

Restore into a deliberately selected **empty** recovery database, never over a live
vault without a reviewed recovery plan:

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml cp ./funes-vault.dump postgres:/tmp/funes-vault.dump
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
  sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --exit-on-error /tmp/funes-vault.dump'
```

Dumps include memories, transcripts, processing records, audit data and credential
hashes. Encrypt and restrict backup access, define retention, and test restoration.
Vault JSON exports are portable application data; database backups provide fuller
operational recovery. Redis persistence does not substitute for the database backup.

## Mobile PWA access

Open the HTTPS website, sign in, and use Install app/Add to Home Screen. Settings →
Profile provides platform guidance and a browser installation button when available.
Choose stable origins before installation; sessions, service workers and pending
captures are associated with the origin. Test on the intended physical devices.

The service worker caches versioned shell resources, not API responses. Explicit
text captures are queued in IndexedDB and synchronize after connectivity and auth
return. Keep browser data until pending captures synchronize. Captures always enter
the suggestion inbox. Offline inference, offline audio and background voice are
not implemented.

Voice requires connectivity, microphone permission and OpenAI Realtime. Live audio
and retrieved context leave the device for OpenAI; the long-lived key stays on the
server. Limits bound session duration, idle time and daily starts. Finalized turns
persist in normal chat threads. A connection failure can happen after data was
sent or saved. New proposals use review; explicit correction tools can update or
archive owned memories through their separate authority.

## OS quick-capture shortcuts

Create a client with a `SUGGEST` permission and an `INTERNAL`
ceiling. An OS shortcut can post `{ "text": "Your note" }` to
`https://vault-api.example.com/v1/captures` with its bearer token. It always queues
review and requires connectivity; it does not use the PWA's device queue.

## Publishing images (maintainers)

The pinned Publish Images workflow publishes all three multi-architecture targets
on `v*` tags or explicit workflow dispatch. Local `pnpm publish:images [version]`
is available for authorized maintainers with GHCR write access. Review the tree,
changelog, test evidence and package visibility before publication. A source PR
alone does not publish a release or change repository visibility.

A manual dispatch accepts a target-platform choice. Keep the multi-architecture
default for releases, or select `linux/amd64` when publishing for an x86 server
and the ARM build cannot complete under emulation. Tag-triggered runs always build
both architectures. Only `v*` tag runs move `latest`; a manual dispatch from
any branch publishes its `sha-<commit>` tag (and version tags if the ref is a
release tag) without touching `latest`.

## App permissions migration

Deploy API, MCP and web as one coordinated breaking release. Take and verify a database backup, stop the old services, then run the migration before starting the new images:

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm migrate
```

The migration removes invalid cross-owner policies first, then keeps the newest valid policy for each client (`updatedAt`, with id breaking ties). Surplus policies and policy purpose are removed. Old requests retain stated purpose but have null policy bindings; they can only be denied, and apps must submit fresh requests. Accounts, sessions, clients and OAuth grants remain valid.

Legacy CLIENT_SUGGESTION metadata is wrapped under `caller` because its top-level keys cannot be trusted. Manual captures, chat and consolidation metadata retain their server-owned shape. Old bearer captures are indistinguishable from other client suggestions, so their old capture ids no longer deduplicate; drain device capture queues before upgrading to avoid retry duplicates. Newly recorded captures retain server-owned capture ids.

Do not run old and new authorization models against the same schema. Roll back by stopping services and restoring a pre-upgrade backup before restarting the previous images. A disposable test vault may instead be reset. Never reset a personal or deployed vault as a rollback procedure.

#!/usr/bin/env sh
# Run the real deployment commands against disposable, project-scoped volumes.
set -eu
project="funes-smoke-${GITHUB_RUN_ID:-$$}"
smoke_env=$(mktemp)
cleanup() {
  docker compose --env-file "$smoke_env" -p "$project" -f docker-compose.prod.yml logs --no-color || true
  docker compose --env-file "$smoke_env" -p "$project" -f docker-compose.prod.yml down --volumes --remove-orphans
  rm -f "$smoke_env"
}
trap cleanup EXIT
cat > "$smoke_env" <<'ENV'
FUNES_VAULT_IMAGE_REPO=funes
FUNES_VAULT_IMAGE_TAG=ci
POSTGRES_PASSWORD=synthetic-smoke-password
POSTGRES_DB=funes_smoke_test
GOOGLE_CLIENT_ID=synthetic-smoke-client
GOOGLE_CLIENT_SECRET=synthetic-smoke-secret
GOOGLE_REDIRECT_URI=https://api.example.test/auth/google/callback
APP_URL=https://vault.example.test
API_URL=https://api.example.test
NEXT_PUBLIC_API_URL=https://api.example.test
OAUTH_ISSUER_URL=https://connect.example.test
MCP_ALLOWED_HOSTS=connect.example.test,localhost,127.0.0.1
EMBEDDINGS_MAX_SENSITIVITY=INTERNAL
API_HTTP_PORT=0
WEB_HTTP_PORT=0
MCP_HTTP_PORT=0
OPENAI_API_KEY=
TYPESAFE_API_KEY=
ENV
# Do not inherit live provider credentials or deployment overrides from the shell.
unset OPENAI_API_KEY TYPESAFE_API_KEY FUNES_VAULT_IMAGE_REPO FUNES_VAULT_IMAGE_TAG POSTGRES_PASSWORD POSTGRES_DB GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GOOGLE_REDIRECT_URI APP_URL API_URL NEXT_PUBLIC_API_URL OAUTH_ISSUER_URL MCP_ALLOWED_HOSTS
compose() { docker compose --env-file "$smoke_env" -p "$project" -f docker-compose.prod.yml "$@"; }
if [ "$#" -eq 0 ]; then set -- api worker web mcp; fi
compose up --no-build --wait --wait-timeout 150 "$@"
for service in "$@"; do
  case "$service" in
    api) endpoint=http://127.0.0.1:4000/health/ready ;;
    web) endpoint=http://127.0.0.1:3000/api/health ;;
    mcp) endpoint=http://127.0.0.1:4100/healthz ;;
    worker) continue ;;
    *) exit 1 ;;
  esac
  compose exec -T "$service" node -e 'fetch(process.argv[1]).then(async r=>{console.log(await r.text());process.exit(r.ok?0:1)})' "$endpoint"
done
for service in "$@"; do
  if [ "$service" = api ]; then
    compose exec -T api node --input-type=module < scripts/smoke-redis-outage.mjs
  fi
  if [ "$service" = mcp ]; then
    mcp_container=$(compose ps -q mcp)
    compose stop -t 15 mcp
    test "$(docker inspect --format '{{.State.ExitCode}}' "$mcp_container")" = 0
  fi
done

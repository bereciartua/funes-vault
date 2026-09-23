#!/usr/bin/env bash
set -euo pipefail

# Builds the Funes Vault API, web, and MCP images from the local working tree and
# pushes them to GHCR. Run it from anywhere inside the repository:
#
#   scripts/publish-images.sh [tag]     # or: pnpm publish:images [tag]
#
# Images are tagged with [tag] (default: latest) plus sha-<short-commit>.
# Set PLATFORMS to override the default linux/amd64,linux/arm64, for example:
#
#   PLATFORMS=linux/amd64 scripts/publish-images.sh
#
# Requires a Docker login to ghcr.io with a token that has the write:packages
# scope (classic personal access token):
#
#   echo "$GHCR_TOKEN" | docker login ghcr.io -u <github-username> --password-stdin

TAG="${1:-latest}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
BUILDER="funes-vault"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [[ -z "${REGISTRY_BASE:-}" ]]; then
  REMOTE_PATH="$(git remote get-url origin | sed -E 's#.*github.com[:/]##; s#\.git$##')"
  if [[ "$REMOTE_PATH" != */* ]]; then
    echo "Set REGISTRY_BASE for a non-GitHub repository" >&2
    exit 1
  fi
  REGISTRY_BASE="ghcr.io/$(printf %s "$REMOTE_PATH" | tr '[:upper:]' '[:lower:]')"
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing to publish images from a dirty working tree" >&2
  exit 1
fi

GIT_SHA="$(git rev-parse --short HEAD)"

# Multi-platform pushes need a docker-container builder; the default docker
# driver cannot assemble multi-arch manifests.
if ! docker buildx inspect "$BUILDER" > /dev/null 2>&1; then
  docker buildx create --name "$BUILDER" --driver docker-container > /dev/null
fi

publish() {
  local name="$1"
  echo "==> Building and pushing $REGISTRY_BASE-$name:$TAG ($PLATFORMS)"
  docker buildx build \
    --build-arg "FUNES_BUILD_SHA=$(git rev-parse HEAD)" \
    --builder "$BUILDER" \
    --platform "$PLATFORMS" \
    --file Dockerfile \
    --target "$name" \
    --tag "$REGISTRY_BASE-$name:$TAG" \
    --tag "$REGISTRY_BASE-$name:sha-$GIT_SHA" \
    --push \
    .
}

publish api
publish web
publish mcp

echo "==> Published api, web, and mcp images as :$TAG and :sha-$GIT_SHA"

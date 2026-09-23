# syntax=docker/dockerfile:1
FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS base
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

FROM base AS deps
ENV SKIP_INSTALL_SIMPLE_GIT_HOOKS=1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/mcp/package.json packages/mcp/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS source
COPY . .
RUN pnpm --filter @funes-vault/shared build

FROM source AS api-build
RUN pnpm --filter @funes-vault/db build && pnpm --filter @funes-vault/api build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm --filter @funes-vault/api deploy --prod --legacy /out/api

FROM source AS web-build
ARG FUNES_BUILD_SHA
ENV FUNES_BUILD_SHA=$FUNES_BUILD_SHA
ENV NEXT_TELEMETRY_DISABLED=1
RUN if [ -z "$FUNES_BUILD_SHA" ]; then \
      FUNES_BUILD_SHA="$(find apps/web/src apps/web/public packages/shared/src -type f -exec sha256sum {} \; | sort | sha256sum | cut -d ' ' -f1)"; \
      export FUNES_BUILD_SHA; \
    fi && pnpm --filter @funes-vault/web build

FROM source AS mcp-build
RUN pnpm --filter @funes-vault/mcp build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm --filter @funes-vault/mcp deploy --prod --legacy /out/mcp

FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS api
WORKDIR /app
ENV NODE_ENV=production
COPY --from=api-build --chown=node:node /out/api ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --start-period=20s CMD wget -qO- http://127.0.0.1:4000/health/live || exit 1
CMD ["node", "dist/main.js"]

FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS web
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=web-build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=web-build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "apps/web/server.js"]

FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS mcp
WORKDIR /app
ENV NODE_ENV=production
ENV FUNES_VAULT_MCP_HTTP_HOST=0.0.0.0
COPY --from=mcp-build --chown=node:node /out/mcp ./
USER node
EXPOSE 4100
HEALTHCHECK --interval=30s --start-period=20s CMD wget -qO- http://127.0.0.1:4100/healthz || exit 1
CMD ["node", "dist/http-server.js"]

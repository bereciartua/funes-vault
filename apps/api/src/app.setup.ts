import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { oauthSupportedScopes } from "@funes-vault/shared";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import type { INestApplication } from "@nestjs/common";
import type { ExpressAdapter as NestExpressAdapter } from "@nestjs/platform-express";
import { SwaggerModule } from "@nestjs/swagger";
import {
  type Express,
  json,
  type NextFunction,
  type Request,
  type Response
} from "express";
import helmet from "helmet";
import { Logger } from "nestjs-pino";

import { SessionsService } from "./auth/sessions.service.js";
import { redisConnectionOptions } from "./common/queue-config.js";
import { requestIdMiddleware } from "./common/request-id.js";
import { apiEnv } from "./config.js";
import { EmbeddingJobsService } from "./embeddings/embedding-jobs.service.js";
import { JobsService } from "./jobs/jobs.service.js";
import { createQueueDashboardAuthMiddleware } from "./jobs/queue-dashboard-auth.js";
import { oauthIssuerUrl, oauthMcpResourceUrl } from "./oauth/oauth.config.js";
import { OAuthProviderService } from "./oauth/oauth-provider.service.js";
import { createOpenApiDocument } from "./openapi.js";

/** @internal */
const QUEUE_DASHBOARD_PATH = "/admin/queues";

// Nest's HttpAdapter surfaces the underlying server as `any`; pin it to the
// Express type once so route/setting calls stay type-checked.
function expressInstance(app: INestApplication): Express {
  const instance: unknown = app.getHttpAdapter().getInstance();

  return instance as Express;
}

function setupOpenApi(app: INestApplication) {
  const document = createOpenApiDocument(app);
  const instance = expressInstance(app);

  instance.get("/openapi.json", (_request: Request, response: Response) => {
    response.json(document);
  });

  SwaggerModule.setup("docs", app, document, {
    customSiteTitle: "Funes Vault API Docs",
    jsonDocumentUrl: "/openapi.json"
  });
}

// Off unless explicitly enabled: the dashboard exposes job payloads and
// mutation actions, and the API is publicly reachable for MCP connectors.
function shouldEnableQueueDashboard() {
  return apiEnv().BULL_BOARD_ENABLED === true;
}

function setupQueueDashboard(app: INestApplication) {
  if (!shouldEnableQueueDashboard()) {
    return;
  }

  const connection = redisConnectionOptions();

  if (!connection) {
    return;
  }

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(QUEUE_DASHBOARD_PATH);

  const queues = [
    app.get(EmbeddingJobsService).getQueue(),
    app.get(JobsService).getQueue()
  ].filter((queue) => queue !== null);

  createBullBoard({
    queues: queues.map((queue) => new BullMQAdapter(queue)),
    serverAdapter
  });

  app.use(
    QUEUE_DASHBOARD_PATH,
    createQueueDashboardAuthMiddleware(app.get(SessionsService)),
    serverAdapter.getRouter()
  );
}

// OAuth 2.1 endpoints for MCP connectors: /authorize, /token, /register,
// /revoke, and the RFC 8414/9728 metadata documents. Protocol handling
// (PKCE, DCR, redirect validation, rate limits) comes from the MCP SDK;
// storage and consent live in the OAuthModule provider.
function setupOAuth(app: INestApplication) {
  const issuerUrl = oauthIssuerUrl();
  const resourceUrl = oauthMcpResourceUrl();

  app.use(
    mcpAuthRouter({
      provider: app.get(OAuthProviderService),
      issuerUrl,
      scopesSupported: [...oauthSupportedScopes],
      resourceName: "Funes Vault",
      resourceServerUrl: resourceUrl
    })
  );

  // Root-path fallback for connectors that ignore the RFC 9728 path-specific
  // metadata URL and fetch /.well-known/oauth-protected-resource directly.
  app.use(
    "/.well-known/oauth-protected-resource",
    (req: Request, res: Response, next: NextFunction) => {
      if (req.method !== "GET" || req.path !== "/") {
        next();

        return;
      }

      res.json({
        resource: resourceUrl.href,
        authorization_servers: [issuerUrl.href],
        scopes_supported: [...oauthSupportedScopes],
        resource_name: "Funes Vault"
      });
    }
  );
}

// Everything the HTTP process mounts beyond the Nest module tree. Shared
// by main.ts and the e2e harness so tests exercise the same wiring.
export function configureApp(app: INestApplication) {
  // Single instance behind exactly one trusted reverse proxy hop.
  expressInstance(app).set("trust proxy", 1);
  app.useLogger(app.get(Logger));
  app.enableCors({
    origin: apiEnv().APP_URL,
    credentials: true
  });
  app.use(requestIdMiddleware);
  const directives = {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "https://validator.swagger.io"],
    connectSrc: ["'self'"],
    upgradeInsecureRequests:
      new URL(apiEnv().APP_URL).protocol === "https:" ? [] : null
  };
  app.use(helmet({ contentSecurityPolicy: { directives } }));
  app.use(
    "/docs",
    helmet.contentSecurityPolicy({
      directives: { ...directives, scriptSrc: ["'self'", "'unsafe-inline'"] }
    })
  );
  // Only import envelopes need the larger limit; other JSON stays at 100 KB.
  expressInstance(app).post(
    ["/v1/data/import", "/v1/data/import/preview"],
    json({ limit: "10mb" })
  );
  (app.getHttpAdapter() as NestExpressAdapter).useBodyParser("json", false, {
    limit: "100kb"
  });
  setupOAuth(app);
  setupOpenApi(app);
  setupQueueDashboard(app);
}

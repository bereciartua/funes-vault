#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from "node:http";
import { pathToFileURL } from "node:url";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import {
  clientAddress,
  hashToken,
  invalidBody,
  isAllowedHost,
  isAllowedOrigin,
  oversizedBody,
  parseList,
  parsePositiveInt,
  readBearerToken,
  readHeader,
  readJsonBody,
  sendError
} from "./http-request.js";
import {
  createFunesVaultMcpServer,
  FunesVaultApiClient,
  type FunesVaultMcpConfig
} from "./index.js";

const defaultHost = "127.0.0.1";
const defaultPort = 4100;
const defaultPath = "/mcp";
const defaultSessionTtlMs = 30 * 60 * 1000;
const defaultRateLimitMax = 120;
const defaultRateLimitWindowMs = 60 * 1000;
const sessionSweepIntervalMs = 60 * 1000;

export type McpHttpServerConfig = FunesVaultMcpConfig & {
  /** Exact IP addresses of trusted immediate reverse proxies. Empty by default. */
  trustedProxies?: string[];
  host?: string;
  port?: number;
  path?: string;
  allowedOrigins?: string[];
  allowedHosts?: string[];
  sessionTtlMs?: number;
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
  resourceMetadataUrl?: string;
  preAuthRateLimitMax?: number;
  onError?: (error: unknown) => void;
};

export type McpHttpServer = {
  server: Server;
  host: string;
  port: number;
  path: string;
  close(): Promise<void>;
};

type McpSession = {
  transport: StreamableHTTPServerTransport;
  tokenHash: string;
  lastSeenAt: number;
};

type RateWindow = {
  count: number;
  windowStartedAt: number;
};

export async function startMcpHttpServer(
  config: McpHttpServerConfig = {}
): Promise<McpHttpServer> {
  const host =
    config.host ?? process.env.FUNES_VAULT_MCP_HTTP_HOST ?? defaultHost;
  const port =
    config.port ??
    parsePositiveInt(process.env.FUNES_VAULT_MCP_HTTP_PORT) ??
    defaultPort;
  const path =
    config.path ?? process.env.FUNES_VAULT_MCP_HTTP_PATH ?? defaultPath;
  const trustedProxies =
    config.trustedProxies ??
    parseList(process.env.FUNES_VAULT_MCP_TRUSTED_PROXIES);
  const allowedOrigins =
    config.allowedOrigins ??
    parseList(process.env.FUNES_VAULT_MCP_ALLOWED_ORIGINS);
  const allowedHosts =
    config.allowedHosts ?? parseList(process.env.FUNES_VAULT_MCP_ALLOWED_HOSTS);
  const sessionTtlMs =
    config.sessionTtlMs ??
    parsePositiveInt(process.env.FUNES_VAULT_MCP_SESSION_TTL_MS) ??
    defaultSessionTtlMs;
  const rateLimitMax =
    config.rateLimitMax ??
    parsePositiveInt(process.env.FUNES_VAULT_MCP_RATE_LIMIT_MAX) ??
    defaultRateLimitMax;
  const rateLimitWindowMs =
    config.rateLimitWindowMs ??
    parsePositiveInt(process.env.FUNES_VAULT_MCP_RATE_LIMIT_WINDOW_MS) ??
    defaultRateLimitWindowMs;
  // RFC 9728 protected resource metadata URL, served by the API's OAuth
  // router. Advertised on 401s so MCP connectors can discover the
  // authorization server (MCP authorization spec).
  const resourceMetadataUrl =
    config.resourceMetadataUrl ??
    process.env.FUNES_VAULT_MCP_RESOURCE_METADATA_URL;
  const wwwAuthenticate = resourceMetadataUrl
    ? `Bearer resource_metadata="${resourceMetadataUrl}"`
    : "Bearer";

  const onError = config.onError ?? ((error: unknown) => console.error(error));
  const preAuthRateLimitMax = config.preAuthRateLimitMax ?? 300;
  const sessions = new Map<string, McpSession>();
  const rateWindows = new Map<string, RateWindow>();

  const sweepTimer = setInterval(
    () => {
      const now = Date.now();

      for (const [sessionId, session] of sessions) {
        if (now - session.lastSeenAt > sessionTtlMs) {
          sessions.delete(sessionId);
          void session.transport.close().catch(onError);
        }
      }

      for (const [tokenHash, rateWindow] of rateWindows) {
        if (now - rateWindow.windowStartedAt > rateLimitWindowMs) {
          rateWindows.delete(tokenHash);
        }
      }
    },
    Math.min(sessionSweepIntervalMs, sessionTtlMs)
  );
  sweepTimer.unref();

  function isRateLimited(tokenHash: string, maximum = rateLimitMax) {
    const now = Date.now();
    const rateWindow = rateWindows.get(tokenHash);

    if (!rateWindow || now - rateWindow.windowStartedAt > rateLimitWindowMs) {
      rateWindows.set(tokenHash, { count: 1, windowStartedAt: now });

      return false;
    }

    rateWindow.count += 1;

    return rateWindow.count > maximum;
  }

  async function handleMcpRequest(req: IncomingMessage, res: ServerResponse) {
    if (!isAllowedOrigin(req, allowedOrigins)) {
      sendError(res, 403, "Origin not allowed");

      return;
    }

    if (!isAllowedHost(req, allowedHosts)) {
      sendError(res, 403, "Host not allowed");

      return;
    }

    if (
      req.method !== "POST" &&
      req.method !== "GET" &&
      req.method !== "DELETE"
    ) {
      sendError(res, 405, "Method not allowed");

      return;
    }

    // Forwarded identity is accepted only from an explicitly trusted proxy.
    if (
      isRateLimited(
        `ip:${clientAddress(req, trustedProxies)}`,
        preAuthRateLimitMax
      )
    ) {
      res.setHeader(
        "Retry-After",
        Math.ceil(rateLimitWindowMs / 1000).toString()
      );
      sendError(res, 429, "Rate limit exceeded");

      return;
    }
    const token = readBearerToken(req);

    if (!token) {
      res.setHeader("WWW-Authenticate", wwwAuthenticate);
      sendError(res, 401, "Missing client token");

      return;
    }

    const tokenHash = hashToken(token);

    if (isRateLimited(tokenHash)) {
      res.setHeader(
        "Retry-After",
        Math.ceil(rateLimitWindowMs / 1000).toString()
      );
      sendError(res, 429, "Rate limit exceeded");

      return;
    }

    const body = req.method === "POST" ? await readJsonBody(req) : undefined;
    if (body === oversizedBody) {
      sendError(res, 413, "Request body too large");

      return;
    }
    if (body === invalidBody) {
      sendError(res, 400, "Invalid JSON body", -32700);

      return;
    }
    const sessionId = readHeader(req, "mcp-session-id");

    if (sessionId) {
      const session = sessions.get(sessionId);

      // A session bound to a different token is reported as not found so an
      // unrelated identity cannot probe for live session ids.
      if (
        !session ||
        session.tokenHash !== tokenHash ||
        Date.now() - session.lastSeenAt > sessionTtlMs
      ) {
        sendError(res, 404, "Session not found", -32001);

        return;
      }

      session.lastSeenAt = Date.now();
      await session.transport.handleRequest(req, res, body);

      return;
    }

    if (req.method !== "POST") {
      sendError(res, 400, "Missing mcp-session-id header");

      return;
    }

    if (!isInitializeRequest(body)) {
      sendError(res, 400, "Expected an initialize request for a new session");

      return;
    }

    const api = new FunesVaultApiClient({
      apiUrl: config.apiUrl,
      appUrl: config.appUrl,
      clientToken: token,
      transport: "http"
    });

    let tokenIsValid: boolean;

    try {
      tokenIsValid = await api.verifyToken();
    } catch (error) {
      onError(error);
      sendError(res, 502, "Funes Vault API is unreachable");

      return;
    }

    if (!tokenIsValid) {
      res.setHeader("WWW-Authenticate", wwwAuthenticate);
      sendError(res, 401, "Invalid client token");

      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSessionId) => {
        sessions.set(newSessionId, {
          transport,
          tokenHash,
          lastSeenAt: Date.now()
        });
      },
      onsessionclosed: (closedSessionId) => {
        sessions.delete(closedSessionId);
      }
    });
    const server = createFunesVaultMcpServer(api, { appUrl: config.appUrl });

    transport.onclose = () => {
      if (transport.sessionId) {
        sessions.delete(transport.sessionId);
      }
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (url.pathname === "/healthz" && req.method === "GET") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));

      return;
    }

    if (url.pathname !== path) {
      sendError(res, 404, "Not found");

      return;
    }

    handleMcpRequest(req, res).catch((error: unknown) => {
      onError(error);
      if (!res.headersSent) {
        sendError(res, 500, "Internal server error");
      } else {
        res.end();
      }
    });
  });

  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(port, host, () => {
      server.removeListener("error", rejectPromise);
      resolvePromise();
    });
  });

  const address = server.address();
  const boundPort =
    address && typeof address === "object" ? address.port : port;

  return {
    server,
    host,
    port: boundPort,
    path,
    async close() {
      clearInterval(sweepTimer);

      for (const [sessionId, session] of sessions) {
        sessions.delete(sessionId);
        await session.transport.close().catch(onError);
      }

      await new Promise<void>((resolvePromise) => {
        server.close(() => resolvePromise());
        server.closeAllConnections();
      });
    }
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  startMcpHttpServer()
    .then((running) => {
      let stopping = false;
      const shutdown = () => {
        if (stopping) {
          return;
        }
        stopping = true;
        const timer = setTimeout(() => process.exit(1), 10000);
        timer.unref();
        void running.close().then(
          () => {
            clearTimeout(timer);
          },
          () => process.exit(1)
        );
      };
      process.once("SIGTERM", shutdown);
      process.once("SIGINT", shutdown);
      console.error(
        `Funes Vault MCP Streamable HTTP server listening on http://${running.host}:${running.port}${running.path}`
      );
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      process.exit(1);
    });
}

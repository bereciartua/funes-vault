import { createServer, type Server } from "node:http";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectInMemory } from "../test/connect-in-memory.js";
import { type McpHttpServer, startMcpHttpServer } from "./http-server.js";
import {
  createFunesVaultMcpServer,
  FunesVaultApiClient,
  initialMcpToolNames
} from "./index.js";

const validToken = "fvlt_valid_token";
const otherValidToken = "fvlt_other_valid_token";

const bundleResponse = {
  requestId: "request_1",
  status: "FULFILLED",
  policyId: "policy_1",
  tokenBudget: 1200,
  estimatedTokens: 42,
  items: [],
  instructions: [],
  denied: [],
  auditEventId: "audit_1"
};

type RecordedApiCall = {
  method: string;
  path: string;
  authorization?: string;
  transportHeader?: string;
};

function startFakeApi() {
  const calls: RecordedApiCall[] = [];

  const server = createServer((req, res) => {
    calls.push({
      method: req.method ?? "",
      path: req.url ?? "",
      authorization: req.headers.authorization,
      transportHeader: req.headers["x-funes-vault-mcp-transport"] as
        string | undefined
    });

    const token = req.headers.authorization?.replace("Bearer ", "");

    if (token !== validToken && token !== otherValidToken) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: "Invalid client token" }));

      return;
    }

    if (req.method === "GET" && req.url === "/v1/memory-categories") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ items: [] }));

      return;
    }

    if (req.method === "POST" && req.url === "/v1/memory-requests") {
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify(bundleResponse));

      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: "Not found" }));
  });

  return new Promise<{ server: Server; url: string; calls: RecordedApiCall[] }>(
    (resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        const port = address && typeof address === "object" ? address.port : 0;

        resolve({ server, url: `http://127.0.0.1:${port}`, calls });
      });
    }
  );
}

const requestMemoryArgs = {
  purpose: "software_development",
  task: "Help with a repository"
};

function initializePayload() {
  return {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test-client", version: "0.0.0" }
    }
  };
}

async function rawInitialize(
  mcp: McpHttpServer,
  headers: Record<string, string>
) {
  return fetch(`http://127.0.0.1:${mcp.port}${mcp.path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers
    },
    body: JSON.stringify(initializePayload())
  });
}

describe("mcp streamable http server", () => {
  let fakeApi: Awaited<ReturnType<typeof startFakeApi>>;
  let mcp: McpHttpServer;

  beforeAll(async () => {
    fakeApi = await startFakeApi();
    mcp = await startMcpHttpServer({
      host: "127.0.0.1",
      port: 0,
      apiUrl: fakeApi.url,
      appUrl: "http://localhost:3000",
      allowedOrigins: ["http://allowed.example"]
    });
  });

  afterAll(async () => {
    await mcp.close();
    await new Promise<void>((resolve) => {
      fakeApi.server.close(() => resolve());
      fakeApi.server.closeAllConnections();
    });
  });

  async function connectHttpClient(token: string) {
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${mcp.port}${mcp.path}`),
      {
        requestInit: {
          headers: { authorization: `Bearer ${token}` }
        }
      }
    );
    const client = new Client({ name: "test-client", version: "0.0.0" });

    await client.connect(transport);

    return { client, transport };
  }

  it("serves the same tools over HTTP as the stdio server factory", async () => {
    const { client } = await connectHttpClient(validToken);

    const stdioEquivalentServer = createFunesVaultMcpServer(
      new FunesVaultApiClient({
        apiUrl: fakeApi.url,
        clientToken: validToken
      })
    );
    const localClient = await connectInMemory(stdioEquivalentServer);

    const httpTools = (await client.listTools()).tools
      .map((tool) => tool.name)
      .sort();
    const localTools = (await localClient.listTools()).tools
      .map((tool) => tool.name)
      .sort();

    expect(httpTools).toEqual(localTools);
    expect(httpTools).toEqual([...initialMcpToolNames].sort());

    const httpResult = await client.callTool({
      name: "request_memory",
      arguments: requestMemoryArgs
    });
    const localResult = await localClient.callTool({
      name: "request_memory",
      arguments: requestMemoryArgs
    });

    expect(httpResult.structuredContent).toEqual(bundleResponse);
    expect(localResult.structuredContent).toEqual(httpResult.structuredContent);

    await localClient.close();
    await stdioEquivalentServer.close();
    await client.close();
  });

  it("labels API calls with the transport that carried them", async () => {
    const transports = fakeApi.calls
      .filter((call) => call.path === "/v1/memory-requests")
      .map((call) => call.transportHeader);

    expect(transports).toContain("http");
    expect(transports).toContain("stdio");
  });

  it("rejects requests without a bearer token", async () => {
    const response = await rawInitialize(mcp, {});

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
  });

  it("rejects invalid client tokens on session initialization", async () => {
    const response = await rawInitialize(mcp, {
      authorization: "Bearer fvlt_wrong_token"
    });

    expect(response.status).toBe(401);
  });

  it("rejects disallowed origins before touching the API", async () => {
    const callCount = fakeApi.calls.length;
    const response = await rawInitialize(mcp, {
      authorization: `Bearer ${validToken}`,
      origin: "http://evil.example"
    });

    expect(response.status).toBe(403);
    expect(fakeApi.calls.length).toBe(callCount);
  });

  it("accepts allowlisted origins", async () => {
    const response = await rawInitialize(mcp, {
      authorization: `Bearer ${validToken}`,
      origin: "http://allowed.example"
    });

    expect(response.status).toBe(200);
  });

  it("does not let a different client token reuse an existing session", async () => {
    const { client, transport } = await connectHttpClient(validToken);
    const sessionId = transport.sessionId;

    expect(sessionId).toBeTruthy();

    const response = await fetch(`http://127.0.0.1:${mcp.port}${mcp.path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${otherValidToken}`,
        "mcp-session-id": sessionId ?? ""
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {}
      })
    });

    expect(response.status).toBe(404);

    await client.close();
  });

  it("rejects non-initialize requests without a session", async () => {
    const response = await fetch(`http://127.0.0.1:${mcp.port}${mcp.path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${validToken}`
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/list",
        params: {}
      })
    });

    expect(response.status).toBe(400);
  });
});

describe("mcp streamable http rate limiting", () => {
  it("limits requests per client token", async () => {
    const fakeApi = await startFakeApi();
    const mcp = await startMcpHttpServer({
      host: "127.0.0.1",
      port: 0,
      apiUrl: fakeApi.url,
      rateLimitMax: 2,
      rateLimitWindowMs: 60_000
    });

    try {
      const statuses: number[] = [];

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await rawInitialize(mcp, {
          authorization: `Bearer ${validToken}`
        });
        statuses.push(response.status);
        await response.body?.cancel();
      }

      expect(statuses[0]).toBe(200);
      expect(statuses[1]).toBe(200);
      expect(statuses[2]).toBe(429);

      // A different token has its own budget.
      const otherResponse = await rawInitialize(mcp, {
        authorization: `Bearer ${otherValidToken}`
      });

      expect(otherResponse.status).toBe(200);
    } finally {
      await mcp.close();
      await new Promise<void>((resolve) => {
        fakeApi.server.close(() => resolve());
        fakeApi.server.closeAllConnections();
      });
    }
  });
});

import { createServer } from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

import { type McpHttpServer, startMcpHttpServer } from "./http-server.js";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) {
    await close();
  }
});
async function upstream(status = 200, body = '{"items":[]}') {
  const calls = vi.fn();
  const server = createServer((_, res) => {
    calls();
    res.writeHead(status, { "content-type": "application/json" });
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanup.push(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      })
  );
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("No address");
  }

  return { url: `http://127.0.0.1:${address.port}`, calls };
}
async function start(config: Parameters<typeof startMcpHttpServer>[0] = {}) {
  const server = await startMcpHttpServer({
    host: "127.0.0.1",
    port: 0,
    ...config
  });
  cleanup.unshift(() => server.close());

  return server;
}
function request(
  server: McpHttpServer,
  headers: Record<string, string> = {},
  body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test", version: "1" }
    }
  })
) {
  return fetch(`http://127.0.0.1:${server.port}/mcp`, {
    method: "POST",
    headers: {
      authorization: "Bearer token",
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers
    },
    body
  });
}
describe("MCP request boundaries", () => {
  it("limits rotating invalid tokens before upstream verification", async () => {
    const api = await upstream(401, "{}");
    const server = await start({ apiUrl: api.url, preAuthRateLimitMax: 2 });
    for (const n of [1, 2]) {
      expect(
        (await request(server, { authorization: `Bearer invalid-${n}` })).status
      ).toBe(401);
    }
    expect(
      (
        await request(server, {
          authorization: "Bearer invalid-3",
          "x-forwarded-for": "1.2.3.4"
        })
      ).status
    ).toBe(429);
    expect(api.calls).toHaveBeenCalledTimes(2);
  });
  it("returns 413 before upstream work for oversized bodies", async () => {
    const api = await upstream();
    const server = await start({ apiUrl: api.url });
    expect(
      (
        await request(
          server,
          {},
          JSON.stringify({ data: "x".repeat(1024 * 1024) })
        )
      ).status
    ).toBe(413);
    expect(api.calls).not.toHaveBeenCalled();
  });
  it("rejects an unlisted host", async () => {
    const api = await upstream();
    const server = await start({
      apiUrl: api.url,
      allowedHosts: ["vault.example.test"]
    });
    expect((await request(server)).status).toBe(403);
    expect(api.calls).not.toHaveBeenCalled();
  });
  it("reports upstream errors through the configured hook", async () => {
    const api = await upstream(502, "<html>gateway</html>");
    const onError = vi.fn();
    const server = await start({ apiUrl: api.url, onError });
    expect((await request(server)).status).toBe(502);
    expect(onError).toHaveBeenCalledOnce();
  });
  it("sweeps expired sessions", async () => {
    const api = await upstream();
    const server = await start({ apiUrl: api.url, sessionTtlMs: 20 });
    const init = await request(server);
    const session = init.headers.get("mcp-session-id");
    await init.body?.cancel();
    expect(session).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(
      (await request(server, { "mcp-session-id": session ?? "" })).status
    ).toBe(404);
  });
  it("deletes sessions and rejects their reuse", async () => {
    const api = await upstream();
    const server = await start({ apiUrl: api.url });
    const init = await request(server);
    const session = init.headers.get("mcp-session-id") ?? "";
    await init.body?.cancel();
    const response = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
      method: "DELETE",
      headers: { authorization: "Bearer token", "mcp-session-id": session }
    });
    expect(response.status).toBe(200);
    expect((await request(server, { "mcp-session-id": session })).status).toBe(
      404
    );
  });
});

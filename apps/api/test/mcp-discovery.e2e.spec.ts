import { startMcpHttpServer } from "@funes-vault/mcp/http";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hashToken } from "../src/clients/client-token.js";
import {
  createE2eApp,
  createE2ePrismaClient,
  createUserWithSession,
  resetTestDatabase
} from "./e2e-harness.js";

describe("privacy: MCP discovery against the real API", () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof createE2ePrismaClient>;
  beforeAll(async () => {
    app = await createE2eApp();
    await app.listen(0, "127.0.0.1");
    prisma = createE2ePrismaClient();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });
  it("discovers usable schemas and submits one minimal memory request", async () => {
    await resetTestDatabase(prisma);
    const owner = await createUserWithSession(
      prisma,
      "mcp-discovery@example.test"
    );
    const token = "fvlt_mcp_discovery_test";
    const client = await prisma.client.create({
      data: {
        userId: owner.userId,
        name: "MCP test",
        type: "MCP_CLIENT",
        trustLevel: "APPROVED",
        tokenHash: hashToken(token)
      }
    });
    await prisma.policy.create({
      data: {
        userId: owner.userId,
        clientId: client.id,
        operations: ["READ"],
        requiresConfirmation: false
      }
    });
    const memory = await prisma.memory.create({
      data: {
        userId: owner.userId,
        kind: "PREFERENCE",
        title: "Favorite color",
        body: "Favorite color is blue."
      }
    });
    const mcp = await startMcpHttpServer({
      host: "127.0.0.1",
      port: 0,
      apiUrl: await app.getUrl(),
      allowedHosts: ["127.0.0.1"]
    });
    const url = `http://127.0.0.1:${mcp.port}/mcp`;
    let session = "";
    const rpc = async (body: object) => {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          ...(session
            ? {
                "mcp-session-id": session,
                "mcp-protocol-version": "2025-03-26"
              }
            : {})
        },
        body: JSON.stringify({ jsonrpc: "2.0", ...body })
      });
      session = response.headers.get("mcp-session-id") ?? session;
      const text = await response.text();
      const data = text.startsWith("event:")
        ? text
            .split("\n")
            .find((line) => line.startsWith("data: "))
            ?.slice(6)
        : text;

      return data
        ? (JSON.parse(data) as {
            result: {
              tools: Array<{
                name: string;
                inputSchema: {
                  required?: string[];
                  properties: Record<string, { description?: string }>;
                };
              }>;
              structuredContent: {
                status: string;
                items: Array<{ memoryId: string }>;
              };
            };
          })
        : null;
    };
    try {
      await rpc({
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "1" }
        }
      });
      await rpc({ method: "notifications/initialized" });
      const listed = await rpc({ id: 2, method: "tools/list" });
      const schema = listed!.result.tools.find(
        (tool) => tool.name === "request_memory"
      )!.inputSchema;
      expect(schema.required).toContain("task");
      expect(schema.required).not.toContain("purpose");
      expect(schema.properties.purpose?.description).toContain("audit");
      const result = await rpc({
        id: 3,
        method: "tools/call",
        params: {
          name: "request_memory",
          arguments: { task: "favorite color", tokenBudget: 500 }
        }
      });
      expect(result!.result.structuredContent).toMatchObject({
        status: "FULFILLED",
        items: [expect.objectContaining({ memoryId: memory.id })]
      });
      expect(
        await prisma.memoryRequest.count({ where: { clientId: client.id } })
      ).toBe(1);
      expect(
        (
          await prisma.memoryRequest.findFirstOrThrow({
            where: { clientId: client.id }
          })
        ).statedPurpose
      ).toBeNull();
    } finally {
      await mcp.close();
    }
  });
});

import { describe, expect, it } from "vitest";

import { connectInMemory } from "../test/connect-in-memory.js";
import {
  createFunesVaultMcpServer,
  FunesVaultApiClient,
  initialMcpToolNames,
  openConsentReview,
  requestMemoryToolInputSchema,
  suggestMemoryToolInputSchema
} from "./index.js";

describe("mcp package", () => {
  it("defines the initial request_memory input shape", () => {
    const parsed = requestMemoryToolInputSchema.parse({
      purpose: "software_development",
      task: "Help with a repository"
    });

    expect(parsed.tokenBudget).toBe(1200);
  });

  it("accepts canonical suggest_memory input", () => {
    const parsed = suggestMemoryToolInputSchema.parse({
      purpose: "software_development",
      kind: "PREFERENCE",
      title: "Prefers local-first tools",
      body: "The user prefers local-first tools.",
      categoryKeys: ["privacy_preferences"]
    });

    expect(parsed.kind).toBe("PREFERENCE");
    expect(parsed.categoryKeys).toEqual(["privacy_preferences"]);
  });

  it("exposes described canonical inputs and never retries a denial", async () => {
    const calls: unknown[] = [];
    const api = new FunesVaultApiClient();
    api.requestMemory = async (input) => {
      calls.push(input);

      return {
        requestId: "request",
        status: "DENIED",
        policyId: null,
        reason: "no_client_policy",
        tokenBudget: 1200,
        estimatedTokens: 0,
        items: [],
        instructions: [],
        denied: [],
        auditEventId: "audit"
      };
    };
    const server = createFunesVaultMcpServer(api);
    const client = await connectInMemory(server);
    try {
      const { tools } = await client.listTools();
      for (const tool of tools) {
        expect(tool.inputSchema.type).toBe("object");
        if (["request_memory", "suggest_memory"].includes(tool.name)) {
          expect(tool.inputSchema.properties?.purpose).toMatchObject({
            description: expect.stringContaining("audit")
          });
          expect(tool.inputSchema.required ?? []).not.toContain("purpose");
          for (const field of Object.values(
            tool.inputSchema.properties ?? {}
          )) {
            expect(field).toHaveProperty("description");
          }
        }
      }
      expect(
        tools.find((t) => t.name === "request_memory")?.inputSchema.required
      ).toContain("task");
      await client.callTool({
        name: "request_memory",
        arguments: {
          task: "Favorite color",
          purpose: "Answer the color question"
        }
      });
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ purpose: "Answer the color question" });
    } finally {
      await client.close();
      await server.close();
    }
  });
  it("includes the first version MCP tools", () => {
    expect(initialMcpToolNames).toContain("request_memory");
    expect(initialMcpToolNames).toContain("suggest_memory");
  });

  it("calls the configured server API with the configured bearer token", async () => {
    const fetchCalls: Array<{ url: string; init: RequestInit }> = [];
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (
      url: string | URL | Request,
      init?: RequestInit
    ) => {
      fetchCalls.push({
        url: url instanceof Request ? url.url : String(url),
        init: init ?? {}
      });

      return new Response(
        JSON.stringify({
          requestId: "request_1",
          status: "FULFILLED",
          policyId: "policy_1",
          reason: null,
          tokenBudget: 1200,
          estimatedTokens: 0,
          items: [],
          instructions: [],
          denied: [],
          auditEventId: "audit_1"
        }),
        { status: 201, headers: { "content-type": "application/json" } }
      );
    };

    try {
      const client = new FunesVaultApiClient({
        apiUrl: "http://localhost:4000/",
        clientToken: "fvlt_test"
      });

      const response = await client.requestMemory({
        purpose: "software_development",
        task: "Help with a repository",
        requestedCategories: [],
        retention: "NO_STORAGE",
        thirdPartyProcessors: [],
        tokenBudget: 1200
      });

      expect(response.status).toBe("FULFILLED");
      expect(fetchCalls[0]).toMatchObject({
        url: "http://localhost:4000/v1/memory-requests"
      });
      expect(fetchCalls[0]?.init.headers).toMatchObject({
        authorization: "Bearer fvlt_test"
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
  it("retrieves reviewed requests through MCP and links to the hosted review", async () => {
    const requested: string[] = [];
    const api = new FunesVaultApiClient({
      appUrl: "https://vault.example.test",
      clientToken: "fvlt_test"
    });
    api.getMemoryRequest = async (requestId) => {
      requested.push(requestId);

      return {
        requestId,
        status: "FULFILLED",
        policyId: "policy_1",
        reason: null,
        tokenBudget: 1200,
        estimatedTokens: 0,
        items: [],
        instructions: [],
        denied: [],
        auditEventId: "audit_1"
      };
    };
    const server = createFunesVaultMcpServer(api, {
      appUrl: "https://vault.example.test"
    });
    const client = await connectInMemory(server);
    try {
      const result = await client.callTool({
        name: "get_memory_request",
        arguments: { requestId: "req_1" }
      });
      expect(requested).toEqual(["req_1"]);
      expect(result.structuredContent).toMatchObject({
        requestId: "req_1",
        status: "FULFILLED"
      });
      const review = await client.callTool({
        name: "open_consent_review",
        arguments: { requestId: "req_1" }
      });
      expect(review.structuredContent).toMatchObject({
        url: "https://vault.example.test/settings/requests?requestId=req_1"
      });
      expect(
        openConsentReview(
          { suggestionId: "suggestion_1" },
          "https://vault.example.test"
        )
      ).toMatchObject({
        url: "https://vault.example.test/inbox?memorySuggestionId=suggestion_1"
      });
    } finally {
      await client.close();
      await server.close();
    }
  });
});

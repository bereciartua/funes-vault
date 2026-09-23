import { describe, expect, it } from "vitest";

import { connectInMemory } from "../test/connect-in-memory.js";
import {
  createFunesVaultMcpServer,
  FunesVaultApiClient,
  type FunesVaultMcpApi,
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

  it("accepts suggest_memory input aliases", () => {
    const parsed = suggestMemoryToolInputSchema.parse({
      purpose: "software_development",
      kind: "preference",
      title: "Prefers local-first tools",
      body: "The user prefers local-first tools.",
      categories: ["privacy_preferences"]
    });

    expect(parsed.kind).toBe("PREFERENCE");
    expect(parsed.categoryKeys).toEqual(["privacy_preferences"]);
  });

  it("includes the first version MCP tools", () => {
    expect(initialMcpToolNames).toContain("request_memory");
    expect(initialMcpToolNames).toContain("suggest_memory");
  });

  it("advertises the granted purpose in tool descriptions when configured", async () => {
    // Policies match purposes exactly and the calling model fills the
    // purpose field, so the hint is what makes a policy apply first try.

    const server = createFunesVaultMcpServer(undefined, {
      suggestedPurpose: "general_context"
    });
    const client = await connectInMemory(server);

    const tools = await client.listTools();
    const byName = new Map(tools.tools.map((tool) => [tool.name, tool]));
    expect(byName.get("request_memory")?.description).toContain(
      'grants the purpose "general_context"'
    );
    expect(byName.get("suggest_memory")?.description).toContain(
      'grants the purpose "general_context"'
    );
    expect(byName.get("list_memory_categories")?.description).not.toContain(
      "general_context"
    );

    await client.close();
    await server.close();
  });

  it("retries under the granted purpose when the caller's purpose has no policy", async () => {
    const seenPurposes: string[] = [];
    const deniedNoPolicy = {
      suggestionId: null,
      memoryId: null,
      status: "DENIED" as const,
      policyId: null,
      auditEventId: null,
      decision: "DENY" as const,
      denied: [{ memoryId: "proposed_memory", reason: "no_active_policy" }]
    };
    const queued = {
      suggestionId: "s1",
      memoryId: null,
      status: "QUEUED_FOR_REVIEW" as const,
      policyId: "p1",
      auditEventId: "a1",
      decision: "ALLOW" as const,
      denied: []
    };
    const fakeApi: FunesVaultMcpApi = {
      async getMemoryRequest() {
        throw new Error("not used");
      },
      async requestMemory() {
        throw new Error("not used");
      },
      async suggestMemory(input: { purpose: string }) {
        seenPurposes.push(input.purpose);

        return input.purpose === "general_context" ? queued : deniedNoPolicy;
      },
      async listMemoryCategories() {
        return { items: [] };
      }
    };

    const server = createFunesVaultMcpServer(fakeApi, {
      suggestedPurpose: "general_context"
    });
    const client = await connectInMemory(server);

    const result = await client.callTool({
      name: "suggest_memory",
      arguments: {
        purpose: "personal_preferences",
        title: "Likes cheesecake",
        body: "The user likes cheesecake."
      }
    });

    expect(seenPurposes).toEqual(["personal_preferences", "general_context"]);
    expect(
      (result.structuredContent as { status: string; decision: string }).status
    ).toBe("QUEUED_FOR_REVIEW");

    await client.close();
    await server.close();
  });

  it("passes through non-policy denials without retrying", async () => {
    const seenPurposes: string[] = [];
    const fakeApi: FunesVaultMcpApi = {
      async getMemoryRequest() {
        throw new Error("not used");
      },
      async requestMemory() {
        throw new Error("not used");
      },
      async suggestMemory(input: { purpose: string }) {
        seenPurposes.push(input.purpose);

        return {
          suggestionId: null,
          memoryId: null,
          status: "DENIED" as const,
          policyId: "p1",
          auditEventId: null,
          decision: "DENY" as const,
          denied: [
            { memoryId: "proposed_memory", reason: "above_sensitivity_ceiling" }
          ]
        };
      },
      async listMemoryCategories() {
        return { items: [] };
      }
    };

    const server = createFunesVaultMcpServer(fakeApi, {
      suggestedPurpose: "general_context"
    });
    const client = await connectInMemory(server);

    await client.callTool({
      name: "suggest_memory",
      arguments: {
        purpose: "some_other_purpose",
        title: "Too secret",
        body: "…"
      }
    });

    expect(seenPurposes).toEqual(["some_other_purpose"]);

    await client.close();
    await server.close();
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

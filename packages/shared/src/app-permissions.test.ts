import { describe, expect, it } from "vitest";

import { importVaultRequestSchema, vaultExportSchema } from "./data-control.js";
import { createMemoryBundleRequestSchema } from "./memory-requests.js";
import { createMemorySuggestionRequestSchema } from "./memory-suggestions.js";
import { updatePolicyRequestSchema } from "./policies.js";

describe("app permission contracts", () => {
  it.each([undefined, null, "", " \n ", "  Reason_Kept CASE  "])(
    "normalizes optional audit purpose: %s",
    (purpose) => {
      const expected =
        typeof purpose === "string" ? purpose.trim() || null : null;
      expect(
        createMemoryBundleRequestSchema.parse({
          task: "favorite color",
          purpose
        }).purpose
      ).toBe(expected);
      expect(
        createMemorySuggestionRequestSchema.parse({
          title: "Favorite color",
          body: "Blue",
          purpose
        }).purpose
      ).toBe(expected);
    }
  );
  it.each([0, false, [], {}, "a".repeat(161)])(
    "rejects invalid purpose",
    (purpose) => {
      expect(
        createMemoryBundleRequestSchema.safeParse({ task: "color", purpose })
          .success
      ).toBe(false);
    }
  );
  it("keeps aliases and does not derive purpose from task", () => {
    expect(
      createMemoryBundleRequestSchema.parse({
        task: " color ",
        token_budget: 500,
        requested_categories: ["preferences"]
      })
    ).toMatchObject({
      task: "color",
      purpose: null,
      tokenBudget: 500,
      requestedCategories: ["preferences"]
    });
    expect(
      updatePolicyRequestSchema.safeParse({
        clientId: "another",
        operations: ["READ"]
      }).success
    ).toBe(false);
  });
  it("rejects v1 and duplicate or missing policy clients", () => {
    const date = "2026-09-24T00:00:00.000Z";
    const exported = {
      metadata: {
        schemaVersion: "funes-vault.export.v2",
        exportedAt: date,
        source: {
          app: "funes-vault",
          userId: "owner",
          email: null,
          displayName: null
        },
        filters: {
          categoryKeys: [],
          sensitivity: null,
          createdAfter: null,
          createdBefore: null,
          includeAuditEvents: false
        }
      },
      categories: [],
      memories: [],
      clients: [
        {
          id: "client",
          name: "App",
          type: "MCP_CLIENT",
          trustLevel: "APPROVED",
          declaredRetention: "UNKNOWN",
          hasToken: false,
          hasPolicy: true,
          lastUsedAt: null,
          createdAt: date,
          updatedAt: date
        }
      ],
      policies: [
        {
          id: "policy",
          clientId: "client",
          clientName: "App",
          operations: ["READ"],
          allowedCategoryKeys: [],
          deniedCategoryKeys: [],
          maxSensitivity: "LOW",
          requiresConfirmation: true,
          expiresAt: null,
          createdAt: date,
          updatedAt: date
        }
      ]
    };
    expect(vaultExportSchema.safeParse(exported).success).toBe(true);
    expect(() =>
      importVaultRequestSchema.parse({
        export: {
          ...exported,
          metadata: {
            ...exported.metadata,
            schemaVersion: "funes-vault.export.v1"
          }
        }
      })
    ).toThrow("Unsupported export version");
    expect(
      vaultExportSchema.safeParse({
        ...exported,
        policies: [...exported.policies, ...exported.policies]
      }).success
    ).toBe(false);
    expect(
      vaultExportSchema.safeParse({ ...exported, clients: [] }).success
    ).toBe(false);
  });
});

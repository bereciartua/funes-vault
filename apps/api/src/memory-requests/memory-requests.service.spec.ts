import {
  AuditEventType,
  MemoryRequestStatus,
  MemorySensitivity
} from "@funes-vault/db";
import { createMemoryBundleRequestSchema } from "@funes-vault/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockAuditTrail as createProvenanceMock } from "../../test/mocks/audit-trail.js";
import { createService } from "../../test/mocks/create-service.js";
import { mockPrisma } from "../../test/mocks/prisma.js";
import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { PolicyEvaluationService } from "../policies/policy-evaluation.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { BundleCompilerService } from "./bundle-compiler.service.js";
import { MemoryRequestsService } from "./memory-requests.service.js";
import { RetrievalService } from "./retrieval.service.js";

function createPrismaMock() {
  const client = mockPrisma({
    memoryRequest: {
      create: vi.fn().mockResolvedValue({ id: "request_1" }),
      update: vi.fn().mockResolvedValue({})
    },
    memoryRequestItem: {
      createMany: vi.fn().mockResolvedValue({ count: 1 })
    },
    auditEvent: {
      create: vi.fn().mockResolvedValue({ id: "audit_1" })
    },
    $transaction: vi.fn(async (callback) => callback(client))
  });

  return client;
}

function createCandidate() {
  const now = new Date("2026-06-27T12:00:00.000Z");

  return {
    id: "memory_1",
    userId: "user_1",
    kind: "PREFERENCE",
    title: "Prefers concise help",
    body: "The user prefers concise implementation help.",
    sensitivity: MemorySensitivity.LOW,
    confidence: 1,
    status: "ACTIVE",
    reviewState: "APPROVED",
    sourceType: "MANUAL",
    sourceClientId: null,
    sourceUri: null,
    sourceMetadata: {},
    lastConfirmedAt: null,
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
    categories: [{ key: "communication_style", name: "Communication Style" }],
    relevanceScore: 0.9
  };
}

describe("privacy: MemoryRequestsService", () => {
  let prismaClient: ReturnType<typeof createPrismaMock>;
  let retrievalService: { retrieve: ReturnType<typeof vi.fn> };
  let policyEvaluationService: { evaluateForClient: ReturnType<typeof vi.fn> };
  let bundleCompiler: { compile: ReturnType<typeof vi.fn> };
  let provenance: ReturnType<typeof createProvenanceMock>;
  let service: MemoryRequestsService;

  beforeEach(async () => {
    prismaClient = createPrismaMock();
    retrievalService = {
      retrieve: vi.fn().mockResolvedValue([createCandidate()])
    };
    policyEvaluationService = {
      evaluateForClient: vi.fn().mockResolvedValue({
        decision: "ALLOW",
        policyId: "policy_1",
        allowedMemoryIds: ["memory_1"],
        denied: [],
        requiresConfirmation: false,
        reason: null
      })
    };
    bundleCompiler = {
      compile: vi.fn().mockReturnValue({
        items: [
          {
            memoryId: "memory_1",
            text: "Prefers concise help: The user prefers concise implementation help.",
            category: "communication_style",
            sensitivity: MemorySensitivity.LOW,
            relevanceScore: 0.9,
            estimatedTokens: 16
          }
        ],
        estimatedTokens: 16,
        instructions: ["Use this context only for the declared task."]
      })
    };
    provenance = createProvenanceMock();
    service = await createService(MemoryRequestsService, [
      { provide: PrismaService, useValue: { client: prismaClient } },
      { provide: RetrievalService, useValue: retrievalService },
      { provide: PolicyEvaluationService, useValue: policyEvaluationService },
      { provide: BundleCompilerService, useValue: bundleCompiler },
      { provide: AuditTrailService, useValue: provenance }
    ]);
  });

  it("creates a policy-filtered bundle and disclosure audit event", async () => {
    const response = await service.createBundleRequest({
      userId: "user_1",
      clientId: "client_1",
      body: createMemoryBundleRequestSchema.parse({
        purpose: "software_development",
        task: "Help with a TypeScript repo",
        requestedCategories: ["communication_style"],
        retention: "NO_STORAGE",
        tokenBudget: 1200
      })
    });

    expect(response.status).toBe(MemoryRequestStatus.FULFILLED);
    expect(response.items).toHaveLength(1);
    expect(retrievalService.retrieve).toHaveBeenCalledWith({
      userId: "user_1",
      task: "Help with a TypeScript repo",
      requestedCategories: ["communication_style"]
    });
    expect(policyEvaluationService.evaluateForClient).toHaveBeenCalledWith(
      "user_1",
      expect.objectContaining({
        clientId: "client_1",
        purpose: "software_development",
        candidateMemories: [expect.objectContaining({ id: "memory_1" })]
      })
    );
    expect(prismaClient.memoryRequestItem.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          memoryRequestId: "request_1",
          memoryId: "memory_1",
          text: expect.stringContaining("Prefers concise help"),
          categoryKey: "communication_style"
        })
      ]
    });
    expect(provenance.createAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "user_1",
        clientId: "client_1",
        memoryRequestId: "request_1",
        type: AuditEventType.MEMORY_DISCLOSURE,
        metadata: expect.objectContaining({
          requestId: "request_1",
          clientId: "client_1",
          transport: "http_api",
          policyId: "policy_1",
          memoryIds: ["memory_1"]
        })
      })
    );
  });

  it("records the MCP transport in disclosure audit metadata", async () => {
    await service.createBundleRequest({
      userId: "user_1",
      clientId: "client_1",
      transport: "mcp_http",
      body: createMemoryBundleRequestSchema.parse({
        purpose: "software_development",
        task: "Help with a TypeScript repo"
      })
    });

    expect(provenance.createAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        metadata: expect.objectContaining({ transport: "mcp_http" })
      })
    );
  });

  it("does not disclose memories when policy requires user confirmation", async () => {
    policyEvaluationService.evaluateForClient.mockResolvedValue({
      decision: "NEEDS_CONFIRMATION",
      policyId: "policy_1",
      allowedMemoryIds: ["memory_1"],
      denied: [],
      requiresConfirmation: true,
      reason: null
    });

    const response = await service.createBundleRequest({
      userId: "user_1",
      clientId: "client_1",
      body: createMemoryBundleRequestSchema.parse({
        purpose: "software_development",
        task: "Help with a TypeScript repo"
      })
    });

    expect(response.status).toBe(MemoryRequestStatus.NEEDS_USER_APPROVAL);
    expect(response.items).toEqual([]);
    expect(prismaClient.memoryRequestItem.createMany).not.toHaveBeenCalled();
    expect(provenance.createAuditEvent).not.toHaveBeenCalled();
  });
});

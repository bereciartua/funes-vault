import {
  ClientRetention,
  ClientTrustLevel,
  ClientType,
  MemorySensitivity,
  MemoryStatus,
  PolicyOperation
} from "@funes-vault/db";
import {
  exportVaultQuerySchema,
  importVaultPreviewRequestSchema,
  importVaultRequestSchema
} from "@funes-vault/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockAuditTrail as createProvenanceMock } from "../../test/mocks/audit-trail.js";
import { createTestModule } from "../../test/mocks/create-service.js";
import { mockPrisma } from "../../test/mocks/prisma.js";
import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { VaultExportService } from "./vault-export.service.js";
import { VaultImportService } from "./vault-import.service.js";
import { VaultImportWriterService } from "./vault-import-writer.service.js";

const now = new Date("2026-06-27T12:00:00.000Z");

function createMemory(overrides: Record<string, unknown> = {}) {
  return {
    id: "memory_1",
    userId: "user_1",
    kind: "PREFERENCE",
    title: "Prefers concise help",
    body: "The user prefers concise implementation help.",
    sensitivity: MemorySensitivity.LOW,
    confidence: 1,
    status: MemoryStatus.ACTIVE,
    reviewState: "APPROVED",
    sourceType: "MANUAL",
    sourceClientId: null,
    sourceUri: null,
    sourceMetadata: {},
    lastConfirmedAt: null,
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
    categories: [
      {
        id: "category_1",
        key: "communication_style",
        name: "Communication Style",
        description: null,
        createdAt: now,
        updatedAt: now
      }
    ],
    ...overrides
  };
}

function createClient(overrides: Record<string, unknown> = {}) {
  return {
    id: "client_1",
    userId: "user_1",
    name: "Local Agent",
    type: ClientType.MCP_CLIENT,
    trustLevel: ClientTrustLevel.APPROVED,
    declaredRetention: ClientRetention.NO_STORAGE,
    tokenHash: "hashed-token",
    lastUsedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function createExport() {
  const memory = createMemory();

  return {
    metadata: {
      schemaVersion: "funes-vault.export.v1" as const,
      exportedAt: now.toISOString(),
      source: {
        app: "funes-vault" as const,
        userId: "source_user",
        email: "demo@funes-vault.local",
        displayName: "Demo"
      },
      filters: {
        categoryKeys: [],
        sensitivity: null,
        createdAfter: null,
        createdBefore: null,
        includeAuditEvents: false
      }
    },
    categories: memory.categories.map((category) => ({
      id: category.id,
      key: category.key,
      name: category.name,
      description: category.description
    })),
    memories: [
      {
        id: memory.id,
        kind: memory.kind,
        title: memory.title,
        body: memory.body,
        categories: memory.categories.map((category) => ({
          id: category.id,
          key: category.key,
          name: category.name,
          description: category.description
        })),
        categoryKeys: ["communication_style"],
        sensitivity: memory.sensitivity,
        confidence: memory.confidence,
        status: memory.status,
        reviewState: memory.reviewState,
        source: {
          type: memory.sourceType,
          clientId: null,
          uri: null,
          metadata: {}
        },
        createdAt: memory.createdAt.toISOString(),
        updatedAt: memory.updatedAt.toISOString(),
        expiresAt: null,
        lastConfirmedAt: null
      }
    ],
    clients: [
      {
        id: "client_1",
        name: "Local Agent",
        type: ClientType.MCP_CLIENT,
        trustLevel: ClientTrustLevel.APPROVED,
        declaredRetention: ClientRetention.NO_STORAGE,
        hasToken: false,
        lastUsedAt: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      }
    ],
    policies: [
      {
        id: "policy_1",
        clientId: "client_1",
        clientName: "Local Agent",
        purpose: "software_development",
        allowedCategoryKeys: ["communication_style"],
        deniedCategoryKeys: [],
        maxSensitivity: MemorySensitivity.INTERNAL,
        operations: [PolicyOperation.READ],
        requiresConfirmation: true,
        expiresAt: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      }
    ]
  };
}

function createPrismaMock() {
  const client = mockPrisma({
    memoryExtractionRun: { findMany: vi.fn().mockResolvedValue([]) },
    processingConsent: { findMany: vi.fn().mockResolvedValue([]) },
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: "user_1",
        email: "demo@funes-vault.local",
        displayName: "Demo"
      })
    },
    memoryCategory: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "category_1",
          key: "communication_style",
          name: "Communication Style",
          description: null,
          createdAt: now,
          updatedAt: now
        }
      ]),
      upsert: vi.fn().mockResolvedValue({})
    },
    memory: {
      findMany: vi.fn().mockResolvedValue([createMemory()]),
      create: vi.fn().mockResolvedValue({ id: "memory_imported" }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 })
    },
    client: {
      findMany: vi.fn().mockResolvedValue([createClient()]),
      create: vi.fn().mockResolvedValue({ id: "client_imported" })
    },
    policy: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "policy_imported" })
    },
    auditEvent: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "audit_1" })
    },
    jobRun: {
      create: vi.fn().mockResolvedValue({ id: "job_1" }),
      update: vi.fn().mockResolvedValue({ id: "job_1" })
    },
    memorySuggestion: {
      create: vi.fn().mockResolvedValue({ id: "suggestion_1" })
    },
    $transaction: vi.fn(async (callback) => callback(client))
  });

  return client;
}

describe("privacy: DataControlService", () => {
  let prismaClient: ReturnType<typeof createPrismaMock>;
  let exporter: VaultExportService;
  let importer: VaultImportService;
  let provenance: ReturnType<typeof createProvenanceMock>;

  beforeEach(async () => {
    prismaClient = createPrismaMock();
    provenance = createProvenanceMock();
    const module = await createTestModule(
      [VaultImportService, VaultExportService, VaultImportWriterService],
      [
        { provide: PrismaService, useValue: { client: prismaClient } },
        { provide: AuditTrailService, useValue: provenance }
      ]
    );
    exporter = module.get(VaultExportService);
    importer = module.get(VaultImportService);
  });

  it("exports scoped vault data without client token material", async () => {
    const response = await exporter.exportVault(
      "user_1",
      exportVaultQuerySchema.parse({
        categoryKeys: "communication_style",
        sensitivity: "LOW"
      })
    );

    expect(prismaClient.memory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user_1",
          status: { notIn: [MemoryStatus.DELETED] },
          sensitivity: MemorySensitivity.LOW,
          categories: {
            some: { key: { in: ["communication_style"] } }
          }
        })
      })
    );
    expect(response.export.clients[0]).toMatchObject({
      id: "client_1",
      hasToken: false
    });
    expect(response.export.clients[0]).not.toHaveProperty("tokenHash");
  });

  it("excludes archived memories from the export when includeArchived is false", async () => {
    await exporter.exportVault(
      "user_1",
      exportVaultQuerySchema.parse({ includeArchived: "false" })
    );

    expect(prismaClient.memory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { notIn: [MemoryStatus.DELETED, MemoryStatus.ARCHIVED] }
        })
      })
    );
  });

  it("previews duplicate memories before import", async () => {
    prismaClient.memory.findMany.mockResolvedValue([
      {
        id: "existing_memory",
        title: "Prefers concise help",
        body: "The user prefers concise implementation help."
      }
    ]);

    const response = await importer.previewImport(
      "user_1",
      importVaultPreviewRequestSchema.parse({
        export: createExport()
      })
    );

    expect(response.preview.memories).toBe(1);
    expect(response.preview.possibleDuplicateMemories).toEqual([
      {
        importedId: "memory_1",
        existingId: "existing_memory",
        title: "Prefers concise help"
      }
    ]);
  });

  it("imports active memories with imported clients kept untrusted", async () => {
    prismaClient.client.findMany.mockResolvedValue([]);

    const response = await importer.importVault(
      "user_1",
      importVaultRequestSchema.parse({
        export: createExport(),
        mode: "ACTIVE_MEMORIES"
      })
    );

    expect(response.imported).toMatchObject({
      mode: "ACTIVE_MEMORIES",
      memoriesCreated: 1,
      suggestionsCreated: 0,
      clientsCreated: 1,
      policiesCreated: 1
    });
    expect(prismaClient.client.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user_1",
        name: "Local Agent (imported)",
        trustLevel: ClientTrustLevel.UNKNOWN
      })
    });
    expect(
      prismaClient.client.create.mock.calls[0]?.[0].data
    ).not.toHaveProperty("tokenHash");
    expect(prismaClient.memory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user_1",
        status: MemoryStatus.ACTIVE,
        reviewState: "APPROVED",
        sourceType: "IMPORT",
        categories: {
          connect: [{ key: "communication_style" }]
        }
      })
    });
  });
});

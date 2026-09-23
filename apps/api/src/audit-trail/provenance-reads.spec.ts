import { describe, expect, it } from "vitest";

import { createService } from "../../test/mocks/create-service.js";
import { mockPrisma } from "../../test/mocks/prisma.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditTrailService } from "./audit-trail.service.js";

const subject = {
  subjectType: "MEMORY",
  subjectId: "related",
  role: "SOURCE",
  labelSnapshot: null,
  metadata: {}
};
const entry = {
  id: "entry",
  memoryId: "memory",
  suggestionId: "suggestion",
  type: "CREATED",
  actorType: "USER",
  metadata: {},
  createdAt: new Date(),
  subjects: [subject]
};
async function setup() {
  const prisma = mockPrisma();
  const service = await createService(AuditTrailService, [
    { provide: PrismaService, useValue: { client: prisma } }
  ]);

  return { prisma, service };
}
describe("privacy: provenance reads", () => {
  it("rejects unowned memory before loading provenance", async () => {
    const { prisma, service } = await setup();
    prisma.memory.findFirst.mockResolvedValue(null);
    await expect(
      service.getMemoryProvenance("owner", "foreign")
    ).rejects.toThrow("Memory not found");
    expect(prisma.memoryProvenanceEntry.findMany).not.toHaveBeenCalled();
  });
  it("hydrates related memory labels only inside the owner's boundary", async () => {
    const { prisma, service } = await setup();
    prisma.memory.findFirst.mockResolvedValue({ id: "memory" });
    prisma.memoryProvenanceEntry.findMany.mockResolvedValue([entry]);
    prisma.memory.findMany.mockResolvedValue([
      {
        id: "related",
        title: "Owner's memory",
        status: "ACTIVE",
        sensitivity: "LOW"
      }
    ]);
    const result = await service.getMemoryProvenance("owner", "memory");
    expect(prisma.memoryProvenanceEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "owner", memoryId: "memory" }
      })
    );
    expect(prisma.memory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "owner", id: { in: ["related"] } }
      })
    );
    expect(result.entries[0]?.subjects[0]).toMatchObject({
      id: "related",
      label: "Owner's memory",
      memoryStatus: "ACTIVE",
      memorySensitivity: "LOW"
    });
  });
  it("groups multiple entries per suggestion without borrowing missing memory details", async () => {
    const { prisma, service } = await setup();
    expect(await service.getSubjectsForSuggestions("owner", [])).toEqual(
      new Map()
    );
    expect(prisma.memoryProvenanceEntry.findMany).not.toHaveBeenCalled();
    prisma.memoryProvenanceEntry.findMany.mockResolvedValue([
      entry,
      { ...entry, id: "second" },
      { ...entry, suggestionId: null }
    ]);
    prisma.memory.findMany.mockResolvedValue([]);
    const result = await service.getSubjectsForSuggestions("owner", [
      "suggestion",
      "suggestion"
    ]);
    expect(prisma.memoryProvenanceEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "owner", suggestionId: { in: ["suggestion"] } }
      })
    );
    expect(result.get("suggestion")).toHaveLength(2);
    expect(result.get("suggestion")?.[0]).toMatchObject({
      label: null,
      memoryStatus: null,
      memorySensitivity: null
    });
  });
});

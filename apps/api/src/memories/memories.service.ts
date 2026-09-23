import { MemoryStatus, type Prisma } from "@funes-vault/db";
import {
  type CreateMemoryRequest,
  type ListMemoriesQuery,
  type UpdateMemoryRequest
} from "@funes-vault/shared";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";

import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { errorMessage } from "../common/errors.js";
import { assertNoSecretLikeContent } from "../common/secret-like-content.js";
import { EmbeddingJobsService } from "../embeddings/embedding-jobs.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { CategoriesService } from "./categories.service.js";
import { toMemoryResponse } from "./memory.mapper.js";
import { memoryInclude, memorySnapshotSelect } from "./memory.types.js";
import { MemoryProvenanceRecorder } from "./memory-provenance-recorder.js";
import { MemorySearchRepository } from "./memory-search.repository.js";
import { toCategoryConnect, toUpdateData } from "./memory-update.js";

/**
 * Coordinates owner-scoped memory reads and mutations with category validation and embedding
 * enqueueing. Mutation helpers and the provenance recorder write history in the same
 * transaction; provider work is queued afterward.
 */
@Injectable()
export class MemoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditTrail: AuditTrailService,
    private readonly embeddingJobs: EmbeddingJobsService,
    private readonly search: MemorySearchRepository,
    private readonly recorder: MemoryProvenanceRecorder,
    private readonly categories: CategoriesService
  ) {}

  listMemories(userId: string, query: ListMemoriesQuery) {
    return this.search.listMemories(userId, query);
  }

  private readonly logger = new Logger(MemoriesService.name);

  async getMemory(userId: string, id: string) {
    const memory = await this.prisma.client.memory.findFirst({
      where: { id, userId },
      include: memoryInclude
    });

    if (!memory) {
      throw new NotFoundException("Memory not found");
    }

    return { memory: toMemoryResponse(memory) };
  }

  async createMemory(userId: string, request: CreateMemoryRequest) {
    assertNoSecretLikeContent(request);
    await this.categories.assertExist(request.categoryKeys);

    const memory = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.memory.create({
        data: {
          userId,
          kind: request.kind,
          title: request.title,
          body: request.body,
          sensitivity: request.sensitivity,
          confidence: request.confidence,
          status: request.status,
          reviewState: request.reviewState,
          sourceType: request.sourceType,
          sourceUri: request.sourceUri,
          sourceMetadata: request.sourceMetadata as Prisma.InputJsonValue,
          expiresAt: request.expiresAt ? new Date(request.expiresAt) : null,
          categories: toCategoryConnect(request.categoryKeys)
        },
        include: memoryInclude
      });

      const auditEvent = await this.recorder.createAuditEvent(
        tx,
        userId,
        created,
        "create"
      );
      await this.recorder.createProvenanceForCreate(tx, {
        userId,
        memory: created,
        auditEventId: auditEvent.id,
        sourceMetadata: request.sourceMetadata
      });

      return created;
    });

    await this.enqueueEmbeddingGeneration(userId, memory.id, "memory_created");

    return { memory: toMemoryResponse(memory) };
  }

  async updateMemory(userId: string, id: string, request: UpdateMemoryRequest) {
    assertNoSecretLikeContent(request);

    if (request.categoryKeys) {
      await this.categories.assertExist(request.categoryKeys);
    }

    const existing = await this.prisma.client.memory.findFirst({
      where: { id, userId },
      select: memorySnapshotSelect
    });

    if (!existing) {
      throw new NotFoundException("Memory not found");
    }

    const mutation = this.recorder.auditMutationForUpdate(
      existing.status,
      request
    );
    const memory = await this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.memory.update({
        where: { id: existing.id },
        data: toUpdateData(request),
        include: memoryInclude
      });

      const auditEvent = await this.recorder.createAuditEvent(
        tx,
        userId,
        updated,
        mutation
      );
      await this.recorder.createProvenanceForUpdate(tx, {
        userId,
        before: existing,
        after: updated,
        request,
        auditEventId: auditEvent.id
      });

      return updated;
    });

    await this.enqueueEmbeddingGeneration(userId, memory.id, "memory_updated");

    return { memory: toMemoryResponse(memory) };
  }

  async deleteMemory(userId: string, id: string) {
    const existing = await this.prisma.client.memory.findFirst({
      where: { id, userId },
      select: memorySnapshotSelect
    });

    if (!existing) {
      throw new NotFoundException("Memory not found");
    }

    const memory = await this.prisma.client.$transaction(async (tx) => {
      const deleted = await tx.memory.update({
        where: { id: existing.id },
        data: { status: MemoryStatus.DELETED },
        include: memoryInclude
      });

      const auditEvent = await this.recorder.createAuditEvent(
        tx,
        userId,
        deleted,
        "delete"
      );
      await this.recorder.createProvenanceForUpdate(tx, {
        userId,
        before: existing,
        after: deleted,
        request: { status: MemoryStatus.DELETED },
        auditEventId: auditEvent.id
      });

      return deleted;
    });

    return { memory: toMemoryResponse(memory) };
  }

  async listCategories() {
    const items = await this.prisma.client.memoryCategory.findMany({
      orderBy: { name: "asc" }
    });

    return {
      items: items.map((category) => ({
        id: category.id,
        key: category.key,
        name: category.name,
        description: category.description
      }))
    };
  }

  async getMemoryProvenance(userId: string, id: string) {
    return this.auditTrail.getMemoryProvenance(userId, id);
  }

  private async enqueueEmbeddingGeneration(
    userId: string,
    memoryId: string,
    reason: "memory_created" | "memory_updated"
  ) {
    if (!this.embeddingJobs) {
      return;
    }

    try {
      await this.embeddingJobs.enqueueMemoryEmbedding({
        userId,
        memoryId,
        reason
      });
    } catch (error) {
      const message = errorMessage(error, "unknown error");
      this.logger.warn(
        `Could not enqueue embedding generation for memory ${memoryId}: ${message}`
      );
    }
  }
}

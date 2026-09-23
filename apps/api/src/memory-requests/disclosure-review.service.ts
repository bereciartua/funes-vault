import { createHash } from "node:crypto";

import { AuditSubjectRole } from "@funes-vault/db";
import { AuditSubjectType } from "@funes-vault/db";
import { MemoryRequestStatus } from "@funes-vault/db";
import {
  AuditActorType,
  AuditEventType,
  type MemoryRequest,
  Prisma
} from "@funes-vault/db";
import {
  type AuditTransport,
  type PaginationQuery,
  type ReviewDisclosureRequest
} from "@funes-vault/shared";
import {
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { buildPagination, paginationSkip } from "../common/pagination.js";
import { policyInclude } from "../policies/policy.types.js";
import { evaluateCandidateMemories } from "../policies/policy-evaluation.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { BundleCompilerService } from "./bundle-compiler.service.js";
import { recordDisclosureDecision } from "./disclosure-audit.js";
import {
  clientRevision,
  disclosureApprovalTtlMs,
  snapshotSchema,
  summary
} from "./disclosure-snapshot.js";
import { requireFreshReview } from "./disclosure-state.js";
import { RetrievalService } from "./retrieval.service.js";

/**
 * Lists owner sharing requests, builds exact revisioned previews and records selected approval
 * or denial. Retrieval claims an approved snapshot once after live revalidation and writes
 * MEMORY_DISCLOSURE in the same transaction.
 */
@Injectable()
export class DisclosureReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly retrieval: RetrievalService,
    private readonly compiler: BundleCompilerService,
    private readonly auditTrail: AuditTrailService
  ) {}

  async list(userId: string, input: PaginationQuery) {
    const where = { userId, status: MemoryRequestStatus.NEEDS_USER_APPROVAL };
    const total = await this.prisma.client.memoryRequest.count({ where });
    const pagination = buildPagination(input, total);
    const rows = await this.prisma.client.memoryRequest.findMany({
      where,
      include: { client: true },
      orderBy: { createdAt: "desc" },
      skip: paginationSkip(pagination),
      take: pagination.limit
    });

    return {
      items: rows.map((row) => summary(row, row.client.name)),
      pagination
    };
  }

  private async candidates(userId: string, id: string) {
    const request = await this.prisma.client.memoryRequest.findFirst({
      where: { id, userId }
    });
    if (!request) {
      throw new NotFoundException("Memory request not found.");
    }

    return this.retrieval.retrieve({
      userId,
      task: request.task,
      requestedCategories: request.requestedCategories
    });
  }

  private async locked(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
    clientId?: string
  ) {
    // Serialize decisions and consumption of this one-time grant. Every lookup
    // is scoped to its owner, and result retrieval also checks the exact client.
    await tx.$queryRaw`SELECT id FROM "MemoryRequest" WHERE id = ${id} AND "userId" = ${userId} FOR UPDATE`;
    const request = await tx.memoryRequest.findFirst({
      where: { id, userId, ...(clientId ? { clientId } : {}) }
    });
    if (!request) {
      throw new NotFoundException("Memory request not found.");
    }

    return request;
  }

  private async context(
    tx: Prisma.TransactionClient,
    request: MemoryRequest,
    ids: string[]
  ) {
    const client = await tx.client.findFirstOrThrow({
      where: { id: request.clientId, userId: request.userId },
      include: {
        policies: {
          where: { purpose: request.purpose },
          include: policyInclude
        }
      }
    });
    const memories = await tx.memory.findMany({
      where: { id: { in: ids }, userId: request.userId },
      include: { categories: true }
    });
    const policy = client.policies.find(
      (p) =>
        p.operations.includes("READ") &&
        (!p.expiresAt || p.expiresAt > new Date())
    );
    const evaluation =
      policy && client.trustLevel !== "BLOCKED"
        ? evaluateCandidateMemories({ policy, candidateMemories: memories })
        : null;
    const allowed = new Set(evaluation?.allowedMemoryIds ?? []);

    return { client, policy, memories, allowed };
  }

  private async previewInTransaction(
    tx: Prisma.TransactionClient,
    request: MemoryRequest,
    candidates: Array<{ id: string; relevanceScore: number }>
  ) {
    const context = await this.context(
      tx,
      request,
      candidates.map((c) => c.id)
    );
    const byId = new Map(context.memories.map((m) => [m.id, m]));
    const approved = candidates.flatMap((c) => {
      const memory = byId.get(c.id);

      return memory && context.allowed.has(c.id)
        ? [{ ...memory, relevanceScore: c.relevanceScore }]
        : [];
    });
    const bundle = this.compiler.compile({
      candidates: approved,
      tokenBudget: request.tokenBudget
    });
    const versions = Object.fromEntries(
      approved.map((m) => [m.id, m.updatedAt.toISOString()])
    );
    const snapshot = {
      items: bundle.items,
      versions,
      instructions: bundle.instructions,
      policyId: context.policy?.id ?? "",
      policyVersion: context.policy?.updatedAt.toISOString() ?? "",
      clientVersion: clientRevision(context.client)
    };
    const revision = createHash("sha256")
      .update(JSON.stringify({ requestId: request.id, ...snapshot }))
      .digest("hex");

    return {
      snapshot,
      preview: {
        request: summary(request, context.client.name),
        revision,
        items: bundle.items,
        canApprove:
          request.status === MemoryRequestStatus.NEEDS_USER_APPROVAL &&
          bundle.items.length > 0
      }
    };
  }

  async preview(userId: string, id: string) {
    const candidates = await this.candidates(userId, id);

    return this.prisma.client.$transaction(async (tx) => {
      const request = await this.locked(tx, userId, id);

      return (await this.previewInTransaction(tx, request, candidates)).preview;
    });
  }

  async decide(userId: string, id: string, input: ReviewDisclosureRequest) {
    const decision = input;
    const candidates =
      decision.action === "approve" ? await this.candidates(userId, id) : [];

    return this.prisma.client.$transaction(async (tx) => {
      const request = await this.locked(tx, userId, id);
      if (request.status !== MemoryRequestStatus.NEEDS_USER_APPROVAL) {
        throw new ConflictException("This request has already been reviewed.");
      }
      if (decision.action === "deny") {
        await tx.memoryRequest.update({
          where: { id },
          data: {
            status: MemoryRequestStatus.DENIED,
            deniedAt: new Date(),
            reviewSnapshot: {}
          }
        });
        await recordDisclosureDecision(
          this.auditTrail,
          tx,
          request,
          AuditEventType.MEMORY_REQUEST_DENIED,
          []
        );
      } else {
        const { snapshot, preview } = await this.previewInTransaction(
          tx,
          request,
          candidates
        );
        if (!preview.canApprove || preview.revision !== decision.revision) {
          throw new ConflictException(
            "The memories or access rules changed. Refresh the preview before approving."
          );
        }
        const ids = new Set(decision.memoryIds);
        const items = snapshot.items.filter((item) => ids.has(item.memoryId));
        if (items.length !== ids.size) {
          throw new ConflictException(
            "Only memories in this preview can be approved."
          );
        }
        await tx.memoryRequest.update({
          where: { id },
          data: {
            status: MemoryRequestStatus.APPROVED,
            approvedAt: new Date(),
            approvalExpiresAt: new Date(Date.now() + disclosureApprovalTtlMs),
            reviewSnapshot: {
              ...snapshot,
              items,
              versions: Object.fromEntries(
                items.map((item) => [
                  item.memoryId,
                  snapshot.versions[item.memoryId]
                ])
              )
            }
          }
        });
        await recordDisclosureDecision(
          this.auditTrail,
          tx,
          request,
          AuditEventType.MEMORY_REQUEST_APPROVED,
          [...ids]
        );
      }

      return { ok: true as const };
    });
  }

  async result(
    userId: string,
    clientId: string,
    id: string,
    transport: AuditTransport
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const request = await this.locked(tx, userId, id, clientId);
      const empty = {
        requestId: id,
        status: request.status,
        policyId: null,
        tokenBudget: request.tokenBudget,
        estimatedTokens: 0,
        items: [],
        instructions: [],
        denied: [],
        auditEventId: null
      };
      if (request.status !== MemoryRequestStatus.APPROVED) {
        return empty;
      }
      const parsed = snapshotSchema.safeParse(request.reviewSnapshot);
      if (
        !parsed.success ||
        !request.approvalExpiresAt ||
        request.approvalExpiresAt <= new Date()
      ) {
        await requireFreshReview(tx, id);

        return { ...empty, status: MemoryRequestStatus.NEEDS_USER_APPROVAL };
      }
      const snapshot = parsed.data;
      const context = await this.context(
        tx,
        request,
        snapshot.items.map((item) => item.memoryId)
      );
      const versions = new Map(
        context.memories.map((m) => [m.id, m.updatedAt.toISOString()])
      );
      const unchanged =
        context.policy?.id === snapshot.policyId &&
        context.policy.updatedAt.toISOString() === snapshot.policyVersion &&
        clientRevision(context.client) === snapshot.clientVersion &&
        snapshot.items.every(
          (item) =>
            context.allowed.has(item.memoryId) &&
            versions.get(item.memoryId) === snapshot.versions[item.memoryId]
        );
      if (!unchanged) {
        await requireFreshReview(tx, id);

        return { ...empty, status: MemoryRequestStatus.NEEDS_USER_APPROVAL };
      }
      await tx.memoryRequestItem.createMany({
        data: snapshot.items.map((item) => ({
          memoryRequestId: id,
          memoryId: item.memoryId,
          text: item.text,
          categoryKey: item.category,
          sensitivity: item.sensitivity,
          relevanceScore: item.relevanceScore
        }))
      });
      const event = await this.auditTrail.createAuditEvent(tx, {
        userId,
        clientId,
        memoryRequestId: id,
        type: AuditEventType.MEMORY_DISCLOSURE,
        actorType: AuditActorType.CLIENT,
        actorId: clientId,
        metadata: {
          transport,
          purpose: request.purpose,
          policyId: snapshot.policyId,
          memoryIds: snapshot.items.map((item) => item.memoryId),
          oneTimeApproval: true
        },
        subjects: [
          ...snapshot.items.map((item) => ({
            type: AuditSubjectType.MEMORY,
            id: item.memoryId,
            role: AuditSubjectRole.DISCLOSED
          })),
          {
            type: AuditSubjectType.MEMORY_REQUEST,
            id,
            role: AuditSubjectRole.REQUEST
          },
          {
            type: AuditSubjectType.CLIENT,
            id: clientId,
            role: AuditSubjectRole.CLIENT
          }
        ]
      });
      await tx.memoryRequest.update({
        where: { id },
        data: {
          status: MemoryRequestStatus.FULFILLED,
          fulfilledAt: new Date(),
          reviewSnapshot: {}
        }
      });

      return {
        ...empty,
        status: MemoryRequestStatus.FULFILLED,
        policyId: snapshot.policyId,
        items: snapshot.items,
        instructions: snapshot.instructions,
        estimatedTokens: snapshot.items.reduce(
          (sum, item) => sum + item.estimatedTokens,
          0
        ),
        auditEventId: event.id
      };
    });
  }
}

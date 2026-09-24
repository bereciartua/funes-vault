import {
  AuditActorType,
  AuditEventType,
  AuditSubjectRole,
  AuditSubjectType,
  type MemoryRequest,
  MemoryRequestStatus,
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
import { PolicyEvaluationService } from "../policies/policy-evaluation.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { BundleCompilerService } from "./bundle-compiler.service.js";
import { recordDisclosureDecision } from "./disclosure-audit.js";
import {
  disclosureContext,
  lockDisclosureRequest
} from "./disclosure-context.js";
import { disclosureMetadata } from "./disclosure-metadata.js";
import { previewDisclosure } from "./disclosure-preview.js";
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
    private readonly auditTrail: AuditTrailService,
    private readonly evaluator: PolicyEvaluationService
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

    const gate = await this.evaluator.evaluateForClient(userId, {
      clientId: request.clientId,
      operation: "READ"
    });
    if (!request.policyId || gate.decision === "DENY") {
      return [];
    }

    return this.retrieval.retrieve({
      userId,
      task: request.task,
      requestedCategories: request.requestedCategories
    });
  }

  private previewInTransaction(
    tx: Prisma.TransactionClient,
    request: MemoryRequest,
    candidates: Array<{ id: string; relevanceScore: number }>
  ) {
    return previewDisclosure(
      tx,
      request,
      candidates,
      this.evaluator,
      this.compiler,
      (tx, request) => this.invalidate(tx, request)
    );
  }

  async preview(userId: string, id: string) {
    const candidates = await this.candidates(userId, id);

    return this.prisma.client.$transaction(async (tx) => {
      const request = await lockDisclosureRequest(tx, userId, id);

      return (await this.previewInTransaction(tx, request, candidates)).preview;
    });
  }

  async decide(userId: string, id: string, input: ReviewDisclosureRequest) {
    const decision = input;
    const candidates =
      decision.action === "approve" ? await this.candidates(userId, id) : [];

    const result = await this.prisma.client.$transaction(async (tx) => {
      const request = await lockDisclosureRequest(tx, userId, id);
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
          await this.invalidate(tx, request);

          return { ok: false as const };
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
    if (!result.ok) {
      throw new ConflictException(
        "The memories or access rules changed. Refresh the preview before approving."
      );
    }

    return result;
  }

  async result(
    userId: string,
    clientId: string,
    id: string,
    transport: AuditTransport
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const request = await lockDisclosureRequest(tx, userId, id, clientId);
      const empty = {
        requestId: id,
        status: request.status,
        policyId: request.policyId,
        reason: request.decisionReason,
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
        await this.invalidate(tx, request);

        return {
          ...empty,
          status: MemoryRequestStatus.NEEDS_USER_APPROVAL,
          reason: "policy_changed" as const
        };
      }
      const snapshot = parsed.data;
      const context = await disclosureContext(
        this.evaluator,
        tx,
        request,
        snapshot.items.map((item) => item.memoryId)
      );
      const versions = new Map(
        context.memories.map((m) => [m.id, m.updatedAt.toISOString()])
      );
      const unchanged =
        context.bound &&
        request.policyId === snapshot.policyId &&
        request.policyVersion === snapshot.policyVersion &&
        context.policy?.id === snapshot.policyId &&
        context.policy.updatedAt.toISOString() === snapshot.policyVersion &&
        clientRevision(context.client) === snapshot.clientVersion &&
        snapshot.items.every(
          (item) =>
            context.allowed.has(item.memoryId) &&
            versions.get(item.memoryId) === snapshot.versions[item.memoryId]
        );
      if (!unchanged) {
        await this.invalidate(tx, request);

        return {
          ...empty,
          status: MemoryRequestStatus.NEEDS_USER_APPROVAL,
          reason: "policy_changed" as const
        };
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
        metadata: disclosureMetadata({
          request,
          transport,
          memoryIds: snapshot.items.map((item) => item.memoryId),
          estimatedTokens: snapshot.items.reduce(
            (sum, item) => sum + item.estimatedTokens,
            0
          ),
          denied: [],
          oneTimeApproval: true
        }),
        subjects: [
          {
            type: AuditSubjectType.POLICY,
            id: request.policyId,
            role: AuditSubjectRole.POLICY,
            label: `${context.client.name} permissions`
          },
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
          decisionReason: null,
          reviewSnapshot: {}
        }
      });

      return {
        ...empty,
        status: MemoryRequestStatus.FULFILLED,
        policyId: snapshot.policyId,
        reason: null,
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

  private async invalidate(
    tx: Prisma.TransactionClient,
    request: MemoryRequest
  ) {
    await requireFreshReview(tx, request.id);
    await recordDisclosureDecision(
      this.auditTrail,
      tx,
      request,
      AuditEventType.MEMORY_REQUEST_DENIED,
      [],
      "policy_changed"
    );
  }
}

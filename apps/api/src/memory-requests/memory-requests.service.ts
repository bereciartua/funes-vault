import {
  AuditActorType,
  AuditEventType,
  AuditSubjectRole,
  AuditSubjectType,
  MemoryRequestStatus,
  PolicyOperation,
  type Prisma
} from "@funes-vault/db";
import {
  type AuditTransport,
  type CreateMemoryBundleRequest
} from "@funes-vault/shared";
import { Injectable } from "@nestjs/common";

import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { PolicyEvaluationService } from "../policies/policy-evaluation.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { BundleCompilerService } from "./bundle-compiler.service.js";
import { RetrievalService } from "./retrieval.service.js";

/**
 * Retrieves candidates for the authenticated client owner and evaluates the declared purpose and
 * policy. Immediate ALLOW commits bundle items and MEMORY_DISCLOSURE; denied and pending
 * requests retain a decision record without disclosure audits.
 */
@Injectable()
export class MemoryRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly retrievalService: RetrievalService,
    private readonly policyEvaluationService: PolicyEvaluationService,
    private readonly bundleCompiler: BundleCompilerService,
    private readonly auditTrail: AuditTrailService
  ) {}

  async createBundleRequest(input: {
    userId: string;
    clientId: string;
    transport?: AuditTransport;
    body: CreateMemoryBundleRequest;
  }) {
    const request = input.body;
    const memoryRequest = await this.prisma.client.memoryRequest.create({
      data: {
        userId: input.userId,
        clientId: input.clientId,
        purpose: request.purpose,
        task: request.task,
        requestedCategories: request.requestedCategories,
        retention: request.retention,
        thirdPartyProcessors: request.thirdPartyProcessors,
        tokenBudget: request.tokenBudget
      }
    });
    const candidates = await this.retrievalService.retrieve({
      userId: input.userId,
      task: request.task,
      requestedCategories: request.requestedCategories
    });
    const policy = await this.policyEvaluationService.evaluateForClient(
      input.userId,
      {
        clientId: input.clientId,
        purpose: request.purpose,
        operation: PolicyOperation.READ,
        candidateMemories: candidates
      }
    );

    if (policy.decision !== "ALLOW") {
      const status =
        policy.decision === "NEEDS_CONFIRMATION"
          ? MemoryRequestStatus.NEEDS_USER_APPROVAL
          : MemoryRequestStatus.DENIED;

      await this.prisma.client.memoryRequest.update({
        where: { id: memoryRequest.id },
        data: {
          status,
          deniedAt: status === MemoryRequestStatus.DENIED ? new Date() : null
        }
      });

      return {
        requestId: memoryRequest.id,
        status,
        policyId: policy.policyId,
        tokenBudget: request.tokenBudget,
        estimatedTokens: 0,
        items: [],
        instructions: [],
        denied: policy.denied,
        auditEventId: null
      };
    }

    const allowedIds = new Set(policy.allowedMemoryIds);
    const approvedCandidates = candidates.filter((candidate) =>
      allowedIds.has(candidate.id)
    );
    const bundle = this.bundleCompiler.compile({
      candidates: approvedCandidates,
      tokenBudget: request.tokenBudget
    });
    const response = await this.prisma.client.$transaction(async (tx) => {
      await tx.memoryRequest.update({
        where: { id: memoryRequest.id },
        data: {
          status: MemoryRequestStatus.FULFILLED,
          approvedAt: new Date(),
          fulfilledAt: new Date()
        }
      });

      if (bundle.items.length > 0) {
        await tx.memoryRequestItem.createMany({
          data: bundle.items.map((item) => ({
            memoryRequestId: memoryRequest.id,
            memoryId: item.memoryId,
            text: item.text,
            categoryKey: item.category,
            sensitivity: item.sensitivity,
            relevanceScore: item.relevanceScore
          }))
        });
      }

      const auditEvent = await this.createDisclosureAuditEvent(tx, {
        userId: input.userId,
        clientId: input.clientId,
        transport: input.transport ?? "http_api",
        memoryRequestId: memoryRequest.id,
        policyId: policy.policyId,
        request,
        disclosedMemoryIds: bundle.items.map((item) => item.memoryId),
        denied: policy.denied,
        estimatedTokens: bundle.estimatedTokens
      });

      return {
        requestId: memoryRequest.id,
        status: MemoryRequestStatus.FULFILLED,
        policyId: policy.policyId,
        tokenBudget: request.tokenBudget,
        estimatedTokens: bundle.estimatedTokens,
        items: bundle.items,
        instructions: bundle.instructions,
        denied: policy.denied,
        auditEventId: auditEvent.id
      };
    });

    return response;
  }

  private async createDisclosureAuditEvent(
    tx: Pick<Prisma.TransactionClient, "auditEvent" | "auditEventSubject">,
    input: {
      userId: string;
      clientId: string;
      transport: AuditTransport;
      memoryRequestId: string;
      policyId: string | null;
      request: CreateMemoryBundleRequest;
      disclosedMemoryIds: string[];
      denied: Array<{ memoryId: string; reason: string }>;
      estimatedTokens: number;
    }
  ) {
    return this.auditTrail.createAuditEvent(tx, {
      userId: input.userId,
      clientId: input.clientId,
      memoryRequestId: input.memoryRequestId,
      type: AuditEventType.MEMORY_DISCLOSURE,
      actorType: AuditActorType.CLIENT,
      actorId: input.clientId,
      metadata: {
        requestId: input.memoryRequestId,
        clientId: input.clientId,
        transport: input.transport,
        policyId: input.policyId,
        purpose: input.request.purpose,
        requestedCategories: input.request.requestedCategories,
        tokenBudget: input.request.tokenBudget,
        estimatedTokens: input.estimatedTokens,
        memoryIds: input.disclosedMemoryIds,
        denied: input.denied
      },
      subjects: [
        ...input.disclosedMemoryIds.map((memoryId) => ({
          type: AuditSubjectType.MEMORY,
          id: memoryId,
          role: AuditSubjectRole.DISCLOSED
        })),
        ...input.denied.map((denied) => ({
          type: AuditSubjectType.MEMORY,
          id: denied.memoryId,
          role: AuditSubjectRole.DENIED,
          metadata: { reason: denied.reason }
        })),
        {
          type: AuditSubjectType.MEMORY_REQUEST,
          id: input.memoryRequestId,
          role: AuditSubjectRole.REQUEST,
          label: input.request.purpose
        },
        {
          type: AuditSubjectType.CLIENT,
          id: input.clientId,
          role: AuditSubjectRole.CLIENT
        },
        {
          type: AuditSubjectType.POLICY,
          id: input.policyId,
          role: AuditSubjectRole.POLICY,
          label: input.request.purpose
        }
      ]
    });
  }
}

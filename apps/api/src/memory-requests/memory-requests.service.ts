import {
  AuditActorType,
  AuditEventType,
  AuditSubjectRole,
  AuditSubjectType,
  MemoryRequestStatus,
  PolicyOperation
} from "@funes-vault/db";
import { appPermissionsLabel } from "@funes-vault/shared";
import {
  type AuditTransport,
  type CreateMemoryBundleRequest
} from "@funes-vault/shared";
import { Injectable } from "@nestjs/common";

import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { PolicyEvaluationService } from "../policies/policy-evaluation.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { BundleCompilerService } from "./bundle-compiler.service.js";
import { disclosureMetadata } from "./disclosure-metadata.js";
import { retrievalInclude, RetrievalService } from "./retrieval.service.js";

/** Authorize before retrieval; commit the final request and its audit atomically. */
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
    const gate = await this.policyEvaluationService.evaluateForClient(
      input.userId,
      {
        clientId: input.clientId,
        operation: PolicyOperation.READ
      }
    );
    const candidates =
      gate.decision === "DENY"
        ? []
        : await this.retrievalService.retrieve({
            userId: input.userId,
            task: request.task,
            requestedCategories: request.requestedCategories
          });

    // Retrieval can involve a provider. Re-read authority and candidate content at commit.
    return this.prisma.client.$transaction(async (tx) => {
      const live =
        gate.decision === "DENY"
          ? []
          : await tx.memory.findMany({
              where: {
                userId: input.userId,
                id: { in: candidates.map((c) => c.id) }
              },
              include: retrievalInclude
            });
      const byId = new Map(live.map((memory) => [memory.id, memory]));
      const current = candidates.flatMap((candidate) => {
        const memory = byId.get(candidate.id);

        return memory
          ? [{ ...memory, relevanceScore: candidate.relevanceScore }]
          : [];
      });
      const policy =
        gate.decision === "DENY"
          ? gate
          : await this.policyEvaluationService.evaluateForClient(
              input.userId,
              {
                clientId: input.clientId,
                operation: PolicyOperation.READ,
                candidateMemories: current
              },
              tx
            );
      const status =
        policy.decision === "ALLOW"
          ? MemoryRequestStatus.FULFILLED
          : policy.decision === "NEEDS_CONFIRMATION"
            ? MemoryRequestStatus.NEEDS_USER_APPROVAL
            : MemoryRequestStatus.DENIED;
      const memoryRequest = await tx.memoryRequest.create({
        data: {
          userId: input.userId,
          clientId: input.clientId,
          statedPurpose: request.purpose,
          task: request.task,
          requestedCategories: request.requestedCategories,
          retention: request.retention,
          thirdPartyProcessors: request.thirdPartyProcessors,
          tokenBudget: request.tokenBudget,
          status,
          policyId: policy.policyId,
          policyVersion: policy.policyVersion,
          decisionReason: policy.reason,
          deniedAt: status === MemoryRequestStatus.DENIED ? new Date() : null,
          approvedAt:
            status === MemoryRequestStatus.FULFILLED ? new Date() : null,
          fulfilledAt:
            status === MemoryRequestStatus.FULFILLED ? new Date() : null
        }
      });
      const subjects = [
        {
          type: AuditSubjectType.MEMORY_REQUEST,
          id: memoryRequest.id,
          role: AuditSubjectRole.REQUEST
        },
        {
          type: AuditSubjectType.CLIENT,
          id: input.clientId,
          role: AuditSubjectRole.CLIENT
        },
        {
          type: AuditSubjectType.POLICY,
          id: policy.policyId,
          role: AuditSubjectRole.POLICY,
          label: appPermissionsLabel(policy.client?.name ?? "App")
        }
      ];
      const empty = {
        requestId: memoryRequest.id,
        status,
        policyId: policy.policyId,
        reason: policy.reason,
        tokenBudget: request.tokenBudget,
        estimatedTokens: 0,
        items: [],
        instructions: [],
        denied: policy.denied,
        auditEventId: null as string | null
      };
      if (status !== MemoryRequestStatus.FULFILLED) {
        if (status === MemoryRequestStatus.DENIED) {
          const event = await this.auditTrail.createAuditEvent(tx, {
            userId: input.userId,
            clientId: input.clientId,
            memoryRequestId: memoryRequest.id,
            type: AuditEventType.MEMORY_REQUEST_DENIED,
            actorType: AuditActorType.CLIENT,
            actorId: input.clientId,
            metadata: {
              memoryIds: [],
              statedPurpose: request.purpose,
              task: request.task,
              operation: "READ",
              policyId: policy.policyId,
              policyVersion: policy.policyVersion,
              decision: policy.decision,
              reason: policy.reason,
              requiresConfirmation: policy.requiresConfirmation
            },
            subjects
          });
          empty.auditEventId = event.id;
        }

        return empty;
      }
      const allowed = new Set(policy.allowedMemoryIds);
      const bundle = this.bundleCompiler.compile({
        candidates: current.filter((c) => allowed.has(c.id)),
        tokenBudget: request.tokenBudget
      });
      if (bundle.items.length) {
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
      const event = await this.auditTrail.createAuditEvent(tx, {
        userId: input.userId,
        clientId: input.clientId,
        memoryRequestId: memoryRequest.id,
        type: AuditEventType.MEMORY_DISCLOSURE,
        actorType: AuditActorType.CLIENT,
        actorId: input.clientId,
        metadata: disclosureMetadata({
          request: memoryRequest,
          transport: input.transport ?? "http_api",
          memoryIds: bundle.items.map((item) => item.memoryId),
          estimatedTokens: bundle.estimatedTokens,
          denied: policy.denied,
          oneTimeApproval: false
        }),
        subjects: [
          ...subjects,
          ...bundle.items.map((item) => ({
            type: AuditSubjectType.MEMORY,
            id: item.memoryId,
            role: AuditSubjectRole.DISCLOSED
          })),
          ...policy.denied.map((item) => ({
            type: AuditSubjectType.MEMORY,
            id: item.memoryId,
            role: AuditSubjectRole.DENIED,
            metadata: { reason: item.reason }
          }))
        ]
      });

      return { ...empty, ...bundle, auditEventId: event.id };
    });
  }
}

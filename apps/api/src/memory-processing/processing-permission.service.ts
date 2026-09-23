import type { Prisma } from "@funes-vault/db";
import { AuditActorType, AuditEventType } from "@funes-vault/db";
import { Injectable } from "@nestjs/common";

import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { lockUser } from "../common/db-locks.js";
import { detectSecretLikeContent } from "../common/secret-like-content.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ProcessorName } from "./extraction.constants.js";
export class ProcessingBlocked extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}
/**
 * Reads and updates versioned owner consent, recording PROCESSING_CONSENT_UPDATED. Checks
 * configured processors and secret-content restrictions before processing. It does not load
 * source messages or persist extraction outcomes.
 */
@Injectable()
export class ProcessingPermissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditTrail: AuditTrailService
  ) {}

  listConsents(userId: string) {
    return this.prisma.client.processingConsent.findMany({
      where: { userId },
      select: {
        processor: true,
        scope: true,
        version: true,
        grantedAt: true,
        revokedAt: true
      }
    });
  }

  isConsentValid(consent: { version: number; revokedAt: Date | null } | null) {
    return (
      consent !== null && consent.revokedAt === null && consent.version === 1
    );
  }

  async check(
    userId: string,
    scope: "extraction" | "consolidation",
    processors: string[],
    payload?: unknown,
    tx?: Prisma.TransactionClient
  ) {
    if (
      payload !== undefined &&
      detectSecretLikeContent({ body: JSON.stringify(payload) }).length
    ) {
      throw new ProcessingBlocked("secret_like_content");
    }
    if (!processors.includes(ProcessorName.classifier)) {
      return;
    }
    const consent = await (
      tx ?? this.prisma.client
    ).processingConsent.findUnique({
      where: {
        userId_processor_scope: {
          userId,
          processor: ProcessorName.classifier,
          scope
        }
      }
    });
    if (!this.isConsentValid(consent)) {
      throw new ProcessingBlocked("processing_consent_required");
    }
  }

  async setConsent(userId: string, scope: string, granted: boolean) {
    return this.prisma.client.$transaction(async (tx) => {
      await lockUser(tx, userId);
      const consent = await tx.processingConsent.upsert({
        where: {
          userId_processor_scope: {
            userId,
            processor: ProcessorName.classifier,
            scope
          }
        },
        create: {
          userId,
          processor: ProcessorName.classifier,
          scope,
          version: 1,
          revokedAt: granted ? null : new Date()
        },
        update: {
          version: 1,
          grantedAt: new Date(),
          revokedAt: granted ? null : new Date()
        }
      });
      await this.auditTrail.createAuditEvent(tx, {
        userId,
        actorType: AuditActorType.USER,
        actorId: userId,
        type: AuditEventType.PROCESSING_CONSENT_UPDATED,
        metadata: {
          processor: ProcessorName.classifier,
          scope,
          version: 1,
          granted
        }
      });

      return consent;
    });
  }
}

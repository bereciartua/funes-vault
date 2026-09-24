import {
  AuditActorType,
  AuditEventType,
  ClientRetention,
  ClientTrustLevel,
  ClientType,
  MemorySensitivity,
  PolicyOperation,
  type Prisma
} from "@funes-vault/db";
import { voiceClientName, webChatClientName } from "@funes-vault/shared";
import { ConflictException, Injectable } from "@nestjs/common";

import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { isPrismaError } from "../common/prisma-errors.js";
import { apiEnv } from "../config.js";
import { PrismaService } from "../prisma/prisma.service.js";

const voiceSensitivityValues = Object.values(MemorySensitivity);

// Voice sessions stream retrieved memory text (and raw audio) to the voice
// provider and often run in public places, so their default disclosure
// ceiling is stricter than web chat. The ceiling lives in the voice client's
// policy, enforced by the policy engine and adjustable in Apps & access.
export function defaultVoiceMaxSensitivity(): MemorySensitivity {
  const configured = apiEnv().VOICE_MAX_SENSITIVITY;

  if (
    configured &&
    voiceSensitivityValues.includes(configured as MemorySensitivity)
  ) {
    return configured as MemorySensitivity;
  }

  return MemorySensitivity.SENSITIVE;
}

type FirstPartyAccessTransaction = Pick<
  Prisma.TransactionClient,
  "auditEvent" | "auditEventSubject" | "client" | "memoryCategory" | "policy"
>;

export type FirstPartyDefinition = {
  clientName: string;
  firstPartyDefault: string;
  maxSensitivity: MemorySensitivity;
  operations: PolicyOperation[];
  requiresConfirmation: boolean;
};

export function webChatDefinition(): FirstPartyDefinition {
  return {
    clientName: webChatClientName,
    firstPartyDefault: "web_chat",
    requiresConfirmation: false,
    maxSensitivity: MemorySensitivity.SECRET,
    operations: [
      PolicyOperation.READ,
      PolicyOperation.SUGGEST,
      PolicyOperation.WRITE
    ]
  };
}

// No WRITE by default: voice proposals queue until the owner grants WRITE.
export function voiceDefinition(): FirstPartyDefinition {
  return {
    clientName: voiceClientName,
    firstPartyDefault: "voice",
    requiresConfirmation: false,
    maxSensitivity: defaultVoiceMaxSensitivity(),
    operations: [PolicyOperation.READ, PolicyOperation.SUGGEST]
  };
}

export function firstPartyCategories(
  db: Pick<Prisma.TransactionClient, "memoryCategory">
) {
  return db.memoryCategory.findMany({
    select: { id: true, key: true },
    orderBy: { name: "asc" }
  });
}
export function firstPartyPolicyFacts(
  definition: FirstPartyDefinition,
  categoryCount: number
) {
  return {
    firstPartyDefault: definition.firstPartyDefault,
    operations: definition.operations,
    maxSensitivity: definition.maxSensitivity,
    requiresConfirmation: definition.requiresConfirmation,
    allowedCategoryCount: categoryCount
  };
}

type EnsureAccessOptions = {
  actorId?: string | null;
  actorType?: AuditActorType;
  tx?: FirstPartyAccessTransaction;
};

/**
 * Owns idempotent first-party grants and policies.
 * Tenant boundary: each grant is created and resolved for exactly one userId.
 * Audit: grant and policy changes use AuditTrailService; voice retains a sensitivity ceiling.
 */
@Injectable()
export class FirstPartyAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditTrailService
  ) {}

  async ensureWebChatAccess(userId: string, options: EnsureAccessOptions = {}) {
    return this.ensureAccess(userId, webChatDefinition(), options);
  }

  async ensureVoiceAccess(userId: string, options: EnsureAccessOptions = {}) {
    return this.ensureAccess(userId, voiceDefinition(), options);
  }

  private async ensureAccess(
    userId: string,
    definition: FirstPartyDefinition,
    options: EnsureAccessOptions
  ) {
    const actorType = options.actorType ?? AuditActorType.SYSTEM;
    const actorId = options.actorId ?? null;

    if (options.tx) {
      return this.ensureAccessWithTx({
        tx: options.tx,
        userId,
        definition,
        actorType,
        actorId
      });
    }

    return this.prisma.client.$transaction((tx) =>
      this.ensureAccessWithTx({
        tx,
        userId,
        definition,
        actorType,
        actorId
      })
    );
  }

  private async ensureAccessWithTx(input: {
    actorId: string | null;
    actorType: AuditActorType;
    definition: FirstPartyDefinition;
    tx: FirstPartyAccessTransaction;
    userId: string;
  }) {
    const client = await this.ensureClient(input);
    const policy = await this.ensurePolicy({
      ...input,
      clientId: client.id,
      createDefault: client.created
    });

    return {
      clientId: client.id,
      policyId: policy?.id ?? null
    };
  }

  private async ensureClient(input: {
    actorId: string | null;
    actorType: AuditActorType;
    definition: FirstPartyDefinition;
    tx: FirstPartyAccessTransaction;
    userId: string;
  }) {
    const existing = await input.tx.client.findFirst({
      where: {
        userId: input.userId,
        name: input.definition.clientName,
        type: ClientType.WEB_APP
      },
      select: { id: true, name: true, trustLevel: true }
    });

    if (existing) {
      return { ...existing, created: false };
    }

    const created = await input.tx.client
      .create({
        data: {
          userId: input.userId,
          name: input.definition.clientName,
          type: ClientType.WEB_APP,
          trustLevel: ClientTrustLevel.APPROVED,
          declaredRetention: ClientRetention.NO_STORAGE
        },
        select: { id: true, name: true, trustLevel: true }
      })
      .catch((error) => {
        if (isPrismaError(error, "P2002")) {
          throw new ConflictException(
            "A connected app uses this first-party name. Rename it in Apps & access before continuing."
          );
        }
        throw error;
      });

    await this.auditService.createAuditEvent(input.tx, {
      userId: input.userId,
      clientId: created.id,
      type: AuditEventType.CLIENT_CREATED,
      actorType: input.actorType,
      actorId: input.actorId,
      metadata: {
        clientId: created.id,
        clientName: created.name,
        trustLevel: created.trustLevel,
        firstPartyDefault: input.definition.firstPartyDefault
      }
    });

    return { ...created, created: true };
  }

  private async ensurePolicy(input: {
    actorId: string | null;
    actorType: AuditActorType;
    clientId: string;
    createDefault: boolean;
    definition: FirstPartyDefinition;
    tx: FirstPartyAccessTransaction;
    userId: string;
  }) {
    const existing = await input.tx.policy.findFirst({
      where: {
        userId: input.userId,
        clientId: input.clientId
      },
      select: { id: true }
    });

    if (existing) {
      return existing;
    }

    if (!input.createDefault) {
      return null;
    }

    const categories = await firstPartyCategories(input.tx);
    const created = await input.tx.policy.create({
      data: {
        userId: input.userId,
        clientId: input.clientId,
        maxSensitivity: input.definition.maxSensitivity,
        operations: input.definition.operations,
        requiresConfirmation: input.definition.requiresConfirmation,
        expiresAt: null,
        allowedCategories: {
          connect: categories.map((category) => ({ id: category.id }))
        }
      },
      select: { id: true }
    });

    await this.auditService.createAuditEvent(input.tx, {
      userId: input.userId,
      clientId: input.clientId,
      type: AuditEventType.POLICY_CREATED,
      actorType: input.actorType,
      actorId: input.actorId,
      metadata: {
        policyId: created.id,
        clientId: input.clientId,
        ...firstPartyPolicyFacts(input.definition, categories.length)
      }
    });

    return created;
  }
}

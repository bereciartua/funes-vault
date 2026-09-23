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
import { Injectable } from "@nestjs/common";

import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { apiEnv } from "../config.js";
import { PrismaService } from "../prisma/prisma.service.js";

export const webChatClientName = "Funes Vault Web Chat";
export const webChatPurpose = "memory_chat";

export const voiceClientName = "Funes Vault Voice";
export const voicePurpose = "memory_voice";

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

type FirstPartyDefinition = {
  clientName: string;
  purpose: string;
  firstPartyDefault: string;
  maxSensitivity: MemorySensitivity;
  operations: PolicyOperation[];
};

function webChatDefinition(): FirstPartyDefinition {
  return {
    clientName: webChatClientName,
    purpose: webChatPurpose,
    firstPartyDefault: "web_chat",
    maxSensitivity: MemorySensitivity.SECRET,
    operations: [
      PolicyOperation.READ,
      PolicyOperation.SUGGEST,
      PolicyOperation.WRITE
    ]
  };
}

// No WRITE: memory writes from a voice session always queue for review.
function voiceDefinition(): FirstPartyDefinition {
  return {
    clientName: voiceClientName,
    purpose: voicePurpose,
    firstPartyDefault: "voice",
    maxSensitivity: defaultVoiceMaxSensitivity(),
    operations: [PolicyOperation.READ, PolicyOperation.SUGGEST]
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
      clientId: client.id
    });

    return {
      clientId: client.id,
      policyId: policy.id
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
      where: { userId: input.userId, name: input.definition.clientName },
      select: { id: true, name: true, trustLevel: true }
    });

    if (existing) {
      return existing;
    }

    const created = await input.tx.client.create({
      data: {
        userId: input.userId,
        name: input.definition.clientName,
        type: ClientType.WEB_APP,
        trustLevel: ClientTrustLevel.APPROVED,
        declaredRetention: ClientRetention.NO_STORAGE
      },
      select: { id: true, name: true, trustLevel: true }
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

    return created;
  }

  private async ensurePolicy(input: {
    actorId: string | null;
    actorType: AuditActorType;
    clientId: string;
    definition: FirstPartyDefinition;
    tx: FirstPartyAccessTransaction;
    userId: string;
  }) {
    const existing = await input.tx.policy.findFirst({
      where: {
        userId: input.userId,
        clientId: input.clientId,
        purpose: input.definition.purpose
      },
      select: { id: true }
    });

    if (existing) {
      return existing;
    }

    const categories = await input.tx.memoryCategory.findMany({
      select: { id: true },
      orderBy: { name: "asc" }
    });
    const created = await input.tx.policy.create({
      data: {
        userId: input.userId,
        clientId: input.clientId,
        purpose: input.definition.purpose,
        maxSensitivity: input.definition.maxSensitivity,
        operations: input.definition.operations,
        requiresConfirmation: false,
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
        purpose: input.definition.purpose,
        clientId: input.clientId,
        maxSensitivity: input.definition.maxSensitivity,
        operations: input.definition.operations,
        requiresConfirmation: false,
        allowedCategoryCount: categories.length,
        firstPartyDefault: input.definition.firstPartyDefault
      }
    });

    return created;
  }
}

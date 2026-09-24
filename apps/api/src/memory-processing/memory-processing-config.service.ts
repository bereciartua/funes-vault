import { createHash } from "node:crypto";

import type { Prisma } from "@funes-vault/db";
import { AuditActorType, AuditEventType } from "@funes-vault/db";
import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit
} from "@nestjs/common";

import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { lockUser } from "../common/db-locks.js";
import { apiEnv } from "../config.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ProcessorName } from "./extraction.constants.js";

export type ProcessingScope = "extraction" | "consolidation";
export type ProcessingSystem = "system_1" | "system_2";

function defaultProcessingSystems(env = apiEnv()) {
  return {
    extraction:
      env.MEMORY_EXTRACTION_SYSTEM ??
      (env.TYPESAFE_API_KEY && env.OPENAI_API_KEY ? "system_1" : "system_2"),
    consolidation:
      env.MEMORY_CONSOLIDATION_SYSTEM ??
      (env.TYPESAFE_API_KEY ? "system_1" : "system_2")
  } satisfies Record<ProcessingScope, ProcessingSystem>;
}

export function resolveProcessingConfiguration(
  env = apiEnv(),
  selected: Record<
    ProcessingScope,
    ProcessingSystem
  > = defaultProcessingSystems(env)
) {
  const extractionSystem = selected.extraction;
  const consolidationSystem = selected.consolidation;
  const configuration = {
    rubric: "memory-processing-v1",
    extraction: {
      system: extractionSystem,
      model:
        extractionSystem === "system_1"
          ? env.MEMORY_EXTRACTION_JEV_MODEL
          : (env.MEMORY_EXTRACTION_LLM_MODEL ?? env.OPENAI_CHAT_MODEL),
      normalizationModel:
        env.MEMORY_NORMALIZATION_LLM_MODEL ?? env.OPENAI_CHAT_MODEL,
      timeoutMs: env.MEMORY_EXTRACTION_TIMEOUT_MS,
      writeMode: env.MEMORY_EXTRACTION_WRITE_MODE,
      processors:
        extractionSystem === "system_1"
          ? Array.of<ProcessorName>(
              ProcessorName.classifier,
              ProcessorName.openai
            )
          : Array.of<ProcessorName>(ProcessorName.openai),
      available: Boolean(
        env.OPENAI_API_KEY &&
        (extractionSystem !== "system_1" || env.TYPESAFE_API_KEY)
      )
    },
    consolidation: {
      system: consolidationSystem,
      model:
        consolidationSystem === "system_1"
          ? env.MEMORY_CONSOLIDATION_JEV_MODEL
          : (env.MEMORY_CONSOLIDATION_LLM_MODEL ?? env.OPENAI_CHAT_MODEL),
      timeoutMs: env.MEMORY_CONSOLIDATION_TIMEOUT_MS,
      applyMode: env.MEMORY_CONSOLIDATION_APPLY_MODE,
      maxSensitivity: env.MEMORY_CONSOLIDATION_MAX_SENSITIVITY,
      processors:
        consolidationSystem === "system_1"
          ? Array.of<ProcessorName>(ProcessorName.classifier)
          : Array.of<ProcessorName>(ProcessorName.openai),
      available: Boolean(
        consolidationSystem === "system_1"
          ? env.TYPESAFE_API_KEY
          : env.OPENAI_API_KEY
      )
    }
  };

  const fingerprint = (value: unknown) =>
    createHash("sha256")
      .update(JSON.stringify(value))
      .digest("hex")
      .slice(0, 20);

  return {
    ...configuration,
    fingerprint: fingerprint(configuration),
    extractionFingerprint: fingerprint({
      rubric: configuration.rubric,
      extraction: configuration.extraction
    })
  };
}
export type ProcessingConfiguration = ReturnType<
  typeof resolveProcessingConfiguration
>;
function freezeConfiguration<T extends object>(value: T): T {
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") {
      freezeConfiguration(child as object);
    }
  }

  return Object.freeze(value);
}
/**
 * Resolves deployment defaults and owner-selected processing providers.
 * Tenant boundary: preferences are read by owner ID.
 * Audit: provider changes are recorded with no private content.
 */
@Injectable()
export class MemoryProcessingConfigService implements OnModuleInit {
  private readonly logger = new Logger(MemoryProcessingConfigService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditTrail: AuditTrailService
  ) {}

  readonly effective = freezeConfiguration(resolveProcessingConfiguration());
  onModuleInit() {
    this.logger.log(JSON.stringify(this.effective));
  }

  get options() {
    const typesafe = resolveProcessingConfiguration(apiEnv(), {
      extraction: "system_1",
      consolidation: "system_1"
    });
    const openai = resolveProcessingConfiguration(apiEnv(), {
      extraction: "system_2",
      consolidation: "system_2"
    });

    return {
      extraction: {
        typesafe: typesafe.extraction.available,
        openai: openai.extraction.available
      },
      consolidation: {
        typesafe: typesafe.consolidation.available,
        openai: openai.consolidation.available
      }
    };
  }

  async forUser(userId: string, tx?: Prisma.TransactionClient) {
    const preferences = await (
      tx ?? this.prisma.client
    ).processingProviderPreference.findMany({
      where: { userId },
      select: { scope: true, system: true }
    });
    const selected = defaultProcessingSystems();
    for (const preference of preferences) {
      if (
        (preference.scope === "extraction" ||
          preference.scope === "consolidation") &&
        (preference.system === "system_1" || preference.system === "system_2")
      ) {
        selected[preference.scope] = preference.system;
      }
    }

    return resolveProcessingConfiguration(apiEnv(), selected);
  }

  async setProvider(
    userId: string,
    scope: ProcessingScope,
    system: ProcessingSystem
  ) {
    const available = resolveProcessingConfiguration(apiEnv(), {
      extraction: system,
      consolidation: system
    })[scope].available;
    if (!available) {
      throw new BadRequestException("Selected provider is not configured");
    }
    await this.prisma.client.$transaction(async (tx) => {
      await lockUser(tx, userId);
      const previous = (await this.forUser(userId, tx))[scope].system;
      await tx.processingProviderPreference.upsert({
        where: { userId_scope: { userId, scope } },
        create: { userId, scope, system },
        update: { system }
      });
      await this.auditTrail.createAuditEvent(tx, {
        userId,
        actorType: AuditActorType.USER,
        actorId: userId,
        type: AuditEventType.PROCESSING_PROVIDER_SELECTED,
        metadata: { action: "provider_selected", scope, previous, system }
      });
    });

    return this.forUser(userId);
  }
}

import { createHash } from "node:crypto";

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";

import { apiEnv } from "../config.js";
import { ProcessorName } from "./extraction.constants.js";

export function resolveProcessingConfiguration(env = apiEnv()) {
  const extractionSystem = env.MEMORY_EXTRACTION_SYSTEM ?? "system_2";
  const consolidationSystem = env.MEMORY_CONSOLIDATION_SYSTEM ?? "system_2";
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

  return {
    ...configuration,
    fingerprint: createHash("sha256")
      .update(JSON.stringify(configuration))
      .digest("hex")
      .slice(0, 20)
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
 * Owns immutable sanitized processor configuration.
 * Tenant boundary: process-wide configuration contains no user data.
 * Audit: logs only sanitized configuration; no audit writes.
 */
@Injectable()
export class MemoryProcessingConfigService implements OnModuleInit {
  private readonly logger = new Logger(MemoryProcessingConfigService.name);
  readonly effective = freezeConfiguration(resolveProcessingConfiguration());
  onModuleInit() {
    this.logger.log(JSON.stringify(this.effective));
  }
}

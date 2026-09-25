import type { Prisma } from "@funes-vault/db";
import { Injectable } from "@nestjs/common";

import { detectSecretLikeContent } from "../common/secret-like-content.js";
import { MemoryProcessingConfigService } from "./memory-processing-config.service.js";

export class ProcessingBlocked extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

/** Rechecks the owner's current provider before disclosure and before writes. */
@Injectable()
export class ProcessingPermissionService {
  constructor(private readonly config: MemoryProcessingConfigService) {}

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
    const selected = (await this.config.forUser(userId, tx))[scope];
    const expected = selected.processors;
    if (
      expected.length !== processors.length ||
      expected.some((processor, index) => processor !== processors[index])
    ) {
      throw new ProcessingBlocked("processing_provider_changed");
    }
    if (!selected.available) {
      throw new ProcessingBlocked("provider_not_configured");
    }
  }
}

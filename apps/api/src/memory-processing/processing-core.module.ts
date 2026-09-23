import { Module } from "@nestjs/common";

import { AuditTrailModule } from "../audit-trail/audit-trail.module.js";
import { MemoryTextNormalizer } from "./llm-memory-extraction.provider.js";
import { MemoryProcessingConfigService } from "./memory-processing-config.service.js";
import { ProcessingPermissionService } from "./processing-permission.service.js";
import { TypeSafeTransport } from "./typesafe.transport.js";

/** Shared provider configuration and consent; importing it never installs extraction routes. */
@Module({
  imports: [AuditTrailModule],
  providers: [
    MemoryProcessingConfigService,
    ProcessingPermissionService,
    TypeSafeTransport,
    MemoryTextNormalizer
  ],
  exports: [
    MemoryProcessingConfigService,
    ProcessingPermissionService,
    TypeSafeTransport,
    MemoryTextNormalizer
  ]
})
export class ProcessingCoreModule {}

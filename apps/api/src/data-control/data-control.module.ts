import { Module } from "@nestjs/common";

import { AuditTrailModule } from "../audit-trail/audit-trail.module.js";
import { DataControlController } from "./data-control.controller.js";
import { VaultExportService } from "./vault-export.service.js";
import { VaultImportService } from "./vault-import.service.js";
import { VaultImportWriterService } from "./vault-import-writer.service.js";

/** Exposes owner exports and import preview/commit, sharing the transactional import writer. */
@Module({
  imports: [AuditTrailModule],
  controllers: [DataControlController],
  providers: [VaultImportService, VaultExportService, VaultImportWriterService],
  exports: [VaultExportService, VaultImportService]
})
export class DataControlModule {}

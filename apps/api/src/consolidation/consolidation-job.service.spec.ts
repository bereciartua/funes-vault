import type { Job } from "bullmq";
import { describe, expect, it, vi } from "vitest";

import { createService } from "../../test/mocks/create-service.js";
import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { ConsolidationJobData } from "./consolidation.types.js";
import { ConsolidationJobService } from "./consolidation-job.service.js";
import { ConsolidationLlmService } from "./consolidation-llm.service.js";
import { ConsolidationOrchestratorService } from "./consolidation-orchestrator.service.js";

describe("consolidation job outcomes", () => {
  it.each([
    ["completed", null, "SUCCEEDED", "JOB_COMPLETED"],
    ["failed", "provider_unavailable", "FAILED", "JOB_FAILED"],
    ["partial", "deadline_or_cancelled", "FAILED", "JOB_FAILED"],
    ["partial", "pair_limit_reached", "FAILED", "JOB_FAILED"],
    ["skipped", "processing_consent_required", "FAILED", "JOB_FAILED"]
  ])(
    "persists %s / %s with the matching audit outcome",
    async (status, reason, jobStatus, auditType) => {
      const result = {
        jobRunId: "job",
        semantic: { status, reason, skippedSources: 6 },
        actions: []
      };
      const update = vi.fn();
      const tx = { jobRun: { update } };
      const audit = vi.fn();
      const service = await createService(ConsolidationJobService, [
        {
          provide: PrismaService,
          useValue: {
            client: {
              ...tx,
              $transaction: (fn: (value: typeof tx) => unknown) => fn(tx)
            }
          }
        },
        { provide: AuditTrailService, useValue: { createAuditEvent: audit } },
        { provide: ConsolidationLlmService, useValue: {} },
        {
          provide: ConsolidationOrchestratorService,
          useValue: { runConsolidation: vi.fn().mockResolvedValue(result) }
        }
      ]);
      await service.processConsolidation({
        data: { jobRunId: "job", userId: "owner" }
      } as Job<ConsolidationJobData>);
      expect(update).toHaveBeenLastCalledWith({
        where: { id: "job" },
        data: expect.objectContaining({
          status: jobStatus,
          metadata: result,
          error: jobStatus === "SUCCEEDED" ? null : expect.any(String)
        })
      });
      expect(audit).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          userId: "owner",
          type: auditType,
          metadata: result
        })
      );
    }
  );
});

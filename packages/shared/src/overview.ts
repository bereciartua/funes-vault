import { z } from "zod";

import { auditEventSchema } from "./audit.js";
import { clientTrustLevelSchema, memorySensitivitySchema } from "./enums.js";
import { memorySchema } from "./memories.js";
import { policySchema } from "./policies.js";

export const overviewResponseSchema = z.object({
  memoryTotal: z.number().int().min(0),
  memorySensitivityCounts: z.array(
    z.object({
      sensitivity: memorySensitivitySchema,
      count: z.number().int().min(0)
    })
  ),
  recentHighSensitivityMemory: memorySchema.nullable(),
  clientTotal: z.number().int().min(0),
  clientTrustCounts: z.array(
    z.object({
      trustLevel: clientTrustLevelSchema,
      count: z.number().int().min(0)
    })
  ),
  policyTotal: z.number().int().min(0),
  categoryTotal: z.number().int().min(0),
  broadestPolicy: policySchema.nullable(),
  suggestionTotal: z.number().int().min(0),
  oldestPendingSuggestionAt: z.iso.datetime().nullable(),
  captureSeries: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        count: z.number().int().min(0)
      })
    )
    .length(30),
  lastCapturedAt: z.iso.datetime().nullable(),
  auditTotal: z.number().int().min(0),
  recentAuditEvents: z.array(auditEventSchema)
});

export type OverviewResponse = z.infer<typeof overviewResponseSchema>;

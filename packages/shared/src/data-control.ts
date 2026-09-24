import { z } from "zod";

import { auditEventSchema } from "./audit.js";
import { clientSchema } from "./clients.js";
import { jsonRecordSchema, queryBoolean } from "./common.js";
import { queryStringOrArraySchema } from "./common.js";
import { memorySensitivitySchema } from "./enums.js";
import { memoryCategorySchema, memorySchema } from "./memories.js";
import { policySchema } from "./policies.js";

export const exportSchemaVersion = "funes-vault.export.v2" as const;

export const optionalDateQuerySchema = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Invalid date"
  })
  .optional();

export const exportVaultQuerySchema = z.object({
  categoryKeys: queryStringOrArraySchema,
  sensitivity: memorySensitivitySchema.optional(),
  createdAfter: optionalDateQuerySchema,
  createdBefore: optionalDateQuerySchema,
  includeAuditEvents: queryBoolean(false),
  includeArchived: queryBoolean(true)
});

export type ExportVaultQuery = z.infer<typeof exportVaultQuerySchema>;

export const vaultExportMetadataSchema = z.object({
  schemaVersion: z.literal(exportSchemaVersion, {
    error: "Unsupported export version; expected funes-vault.export.v2"
  }),
  exportedAt: z.iso.datetime(),
  source: z.object({
    app: z.literal("funes-vault"),
    userId: z.string().min(1),
    email: z.email().nullable(),
    displayName: z.string().nullable()
  }),
  filters: z.object({
    categoryKeys: z.array(z.string().min(1)),
    sensitivity: memorySensitivitySchema.nullable(),
    createdAfter: z.string().nullable(),
    createdBefore: z.string().nullable(),
    includeAuditEvents: z.boolean()
  })
});

export const vaultExportSchema = z
  .object({
    processing: z
      .object({
        runs: z.array(jsonRecordSchema),
        consents: z.array(jsonRecordSchema)
      })
      .optional(),
    metadata: vaultExportMetadataSchema,
    categories: z.array(memoryCategorySchema),
    memories: z.array(memorySchema),
    clients: z.array(clientSchema),
    policies: z.array(policySchema),
    auditEvents: z.array(auditEventSchema).optional()
  })
  .superRefine((value, ctx) => {
    const clients = new Set(value.clients.map((client) => client.id));
    const seen = new Set<string>();
    value.policies.forEach((policy, index) => {
      if (!clients.has(policy.clientId) || seen.has(policy.clientId)) {
        ctx.addIssue({
          code: "custom",
          path: ["policies", index, "clientId"],
          message:
            "Each policy must reference a client in this export, with at most one policy per client"
        });
      }
      seen.add(policy.clientId);
    });
  });

export type VaultExport = z.infer<typeof vaultExportSchema>;

export const vaultExportResponseSchema = z.object({
  export: vaultExportSchema
});

export type VaultExportResponse = z.infer<typeof vaultExportResponseSchema>;

export const importVaultPreviewRequestSchema = z.object({
  export: vaultExportSchema
});

export type ImportVaultPreviewRequest = z.infer<
  typeof importVaultPreviewRequestSchema
>;

export const importVaultModeSchema = z.enum(["SUGGESTIONS", "ACTIVE_MEMORIES"]);

export const importVaultRequestSchema = z.object({
  export: vaultExportSchema,
  mode: importVaultModeSchema.default("SUGGESTIONS")
});

export type ImportVaultRequest = z.infer<typeof importVaultRequestSchema>;

export const importVaultPreviewResultSchema = z.object({
  schemaVersion: z.literal(exportSchemaVersion, {
    error: "Unsupported export version; expected funes-vault.export.v2"
  }),
  exportedAt: z.iso.datetime(),
  memories: z.number().int().min(0),
  archivedMemories: z.number().int().min(0).default(0),
  categories: z.number().int().min(0),
  clients: z.number().int().min(0),
  policies: z.number().int().min(0),
  auditEvents: z.number().int().min(0),
  possibleDuplicateMemories: z.array(
    z.object({
      importedId: z.string().min(1),
      existingId: z.string().min(1),
      title: z.string().min(1)
    })
  ),
  categoryKeys: z.array(z.string().min(1))
});

export type ImportVaultPreview = z.infer<typeof importVaultPreviewResultSchema>;

export const importVaultPreviewResponseSchema = z.object({
  preview: importVaultPreviewResultSchema
});

export type ImportVaultPreviewResponse = z.infer<
  typeof importVaultPreviewResponseSchema
>;

export const importVaultResponseSchema = z.object({
  imported: z.object({
    mode: importVaultModeSchema,
    memoriesCreated: z.number().int().min(0),
    suggestionsCreated: z.number().int().min(0),
    clientsCreated: z.number().int().min(0),
    policiesCreated: z.number().int().min(0),
    categoriesUpserted: z.number().int().min(0),
    jobRunId: z.string().min(1)
  })
});

export type ImportVaultResponse = z.infer<typeof importVaultResponseSchema>;

export type OptionalDateQuery = z.infer<typeof optionalDateQuerySchema>;

export type VaultExportMetadata = z.infer<typeof vaultExportMetadataSchema>;

export type ImportVaultMode = z.infer<typeof importVaultModeSchema>;

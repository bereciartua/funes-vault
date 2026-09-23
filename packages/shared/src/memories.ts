import { z } from "zod";

import { jsonRecordSchema, requireAtLeastOneField } from "./common.js";
import {
  nullableDatetimeSchema,
  paginationQuerySchema,
  paginationSchema,
  queryStringOrArraySchema
} from "./common.js";
import {
  auditActorTypeSchema,
  memoryKindSchema,
  memoryProvenanceEntryTypeSchema,
  memorySensitivitySchema,
  memoryStatusSchema,
  provenanceSubjectRoleSchema,
  provenanceSubjectTypeSchema,
  reviewStateSchema,
  sourceTypeSchema
} from "./enums.js";

export const memoryCategorySchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable()
});

export type MemoryCategory = z.infer<typeof memoryCategorySchema>;

export const memorySchema = z.object({
  id: z.string().min(1),
  kind: memoryKindSchema,
  title: z.string().min(1),
  body: z.string().min(1),
  categories: z.array(memoryCategorySchema),
  categoryKeys: z.array(z.string().min(1)),
  sensitivity: memorySensitivitySchema,
  confidence: z.number().min(0).max(1),
  status: memoryStatusSchema,
  reviewState: reviewStateSchema,
  source: z.object({
    type: sourceTypeSchema,
    clientId: z.string().nullable(),
    uri: z.string().nullable(),
    metadata: jsonRecordSchema
  }),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime().nullable(),
  lastConfirmedAt: z.iso.datetime().nullable()
});

export type Memory = z.infer<typeof memorySchema>;

export const provenanceSubjectSchema = z.object({
  type: provenanceSubjectTypeSchema,
  id: z.string().min(1),
  role: provenanceSubjectRoleSchema,
  label: z.string().nullable(),
  metadata: jsonRecordSchema,
  memoryStatus: memoryStatusSchema.nullable().default(null),
  memorySensitivity: memorySensitivitySchema.nullable().default(null)
});

export type ProvenanceSubject = z.infer<typeof provenanceSubjectSchema>;

export const memoryProvenanceEntrySchema = z.object({
  id: z.string().min(1),
  type: memoryProvenanceEntryTypeSchema,
  actorType: auditActorTypeSchema,
  actorId: z.string().nullable(),
  sourceType: sourceTypeSchema.nullable(),
  sourceClientId: z.string().nullable(),
  sourceUri: z.string().nullable(),
  suggestionId: z.string().nullable(),
  jobRunId: z.string().nullable(),
  auditEventId: z.string().nullable(),
  memoryRequestId: z.string().nullable(),
  reason: z.string().nullable(),
  evidence: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  metadata: jsonRecordSchema,
  subjects: z.array(provenanceSubjectSchema),
  createdAt: z.iso.datetime()
});

export type MemoryProvenanceEntry = z.infer<typeof memoryProvenanceEntrySchema>;

export const memoryProvenanceResponseSchema = z.object({
  memoryId: z.string().min(1),
  entries: z.array(memoryProvenanceEntrySchema)
});

export type MemoryProvenanceResponse = z.infer<
  typeof memoryProvenanceResponseSchema
>;

const memoryFields = {
  kind: memoryKindSchema,
  title: z.string().trim().min(1).max(180),
  body: z.string().trim().min(1).max(10000),
  categoryKeys: z.array(z.string().trim().min(1)).max(12),
  sensitivity: memorySensitivitySchema,
  confidence: z.number().min(0).max(1),
  status: memoryStatusSchema,
  reviewState: reviewStateSchema,
  expiresAt: nullableDatetimeSchema,
  sourceType: sourceTypeSchema,
  sourceUri: z.url().trim().nullable().optional(),
  sourceMetadata: jsonRecordSchema
};

export const createMemoryRequestSchema = z.object({
  ...memoryFields,
  categoryKeys: memoryFields.categoryKeys.default([]),
  sensitivity: memoryFields.sensitivity.default("LOW"),
  confidence: memoryFields.confidence.default(1),
  status: memoryFields.status.default("ACTIVE"),
  reviewState: memoryFields.reviewState.default("APPROVED"),
  sourceType: memoryFields.sourceType.default("MANUAL"),
  sourceMetadata: memoryFields.sourceMetadata.default({})
});

export type CreateMemoryRequest = z.infer<typeof createMemoryRequestSchema>;

export const updateMemoryRequestSchema = z
  .object(memoryFields)
  .partial()
  .refine(requireAtLeastOneField, {
    message: "At least one field is required"
  });

export type UpdateMemoryRequest = z.infer<typeof updateMemoryRequestSchema>;

export const listMemoriesQuerySchema = paginationQuerySchema.extend({
  query: z.string().trim().max(200).optional(),
  categoryKeys: queryStringOrArraySchema,
  sensitivity: memorySensitivitySchema.optional(),
  status: memoryStatusSchema.optional(),
  reviewState: reviewStateSchema.optional(),
  sort: z
    .enum(["createdAt", "updatedAt", "title", "confidence"])
    .default("updatedAt"),
  direction: z.enum(["asc", "desc"]).default("desc")
});

export type ListMemoriesQuery = z.infer<typeof listMemoriesQuerySchema>;

export const memoryResponseSchema = z.object({
  memory: memorySchema
});

export type MemoryResponse = z.infer<typeof memoryResponseSchema>;

export const listMemoriesResponseSchema = z.object({
  items: z.array(memorySchema),
  pagination: paginationSchema
});

export type ListMemoriesResponse = z.infer<typeof listMemoriesResponseSchema>;

export const listCategoriesResponseSchema = z.object({
  items: z.array(memoryCategorySchema)
});

export type ListCategoriesResponse = z.infer<
  typeof listCategoriesResponseSchema
>;

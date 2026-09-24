import { z } from "zod";

import { requireAtLeastOneField } from "./common.js";
import { paginationQuerySchema, paginationSchema } from "./common.js";
import {
  clientRetentionSchema,
  clientTrustLevelSchema,
  clientTypeSchema,
  memorySensitivitySchema
} from "./enums.js";

export const clientSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: clientTypeSchema,
  trustLevel: clientTrustLevelSchema,
  declaredRetention: clientRetentionSchema,
  hasToken: z.boolean(),
  // The client list includes its latest unexpired policy for display.
  policySummary: z
    .object({
      maxSensitivity: memorySensitivitySchema,
      allowedCategoryKeys: z.array(z.string()),
      requiresConfirmation: z.boolean()
    })
    .nullable()
    .optional(),
  hasPolicy: z.boolean(),
  oauthConnector: z.boolean().default(false),
  lastUsedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
});

export type Client = z.infer<typeof clientSchema>;

export const createClientRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: clientTypeSchema.default("OTHER"),
  trustLevel: clientTrustLevelSchema.default("UNKNOWN"),
  declaredRetention: clientRetentionSchema.default("UNKNOWN")
});

export type CreateClientRequest = z.infer<typeof createClientRequestSchema>;

export const updateClientRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    type: clientTypeSchema.optional(),
    trustLevel: clientTrustLevelSchema.optional(),
    declaredRetention: clientRetentionSchema.optional(),
    rotateToken: z.boolean().optional()
  })
  .refine(requireAtLeastOneField, {
    message: "At least one field is required"
  });

export type UpdateClientRequest = z.infer<typeof updateClientRequestSchema>;

export const clientResponseSchema = z.object({
  client: clientSchema,
  token: z.string().min(1).optional()
});

export type ClientResponse = z.infer<typeof clientResponseSchema>;

export const listClientsQuerySchema = paginationQuerySchema;

export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>;

export const listClientsResponseSchema = z.object({
  items: z.array(clientSchema),
  pagination: paginationSchema
});

export type ListClientsResponse = z.infer<typeof listClientsResponseSchema>;

export const clientOptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: clientTypeSchema,
  trustLevel: clientTrustLevelSchema
});

export type ClientOption = z.infer<typeof clientOptionSchema>;

export const listClientOptionsQuerySchema = z.object({
  query: z.string().trim().max(120).optional()
});

export type ListClientOptionsQuery = z.infer<
  typeof listClientOptionsQuerySchema
>;

export const listClientOptionsResponseSchema = z.object({
  items: z.array(clientOptionSchema)
});

export type ListClientOptionsResponse = z.infer<
  typeof listClientOptionsResponseSchema
>;

import { z } from "zod";

import { requireAtLeastOneField } from "./common.js";
import {
  nullableDatetimeSchema,
  paginationQuerySchema,
  paginationSchema
} from "./common.js";
import { memorySensitivitySchema, policyOperationSchema } from "./enums.js";

export const policySchema = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1),
  clientName: z.string().min(1).nullable(),
  allowedCategoryKeys: z.array(z.string().min(1)),
  deniedCategoryKeys: z.array(z.string().min(1)),
  maxSensitivity: memorySensitivitySchema,
  operations: z.array(policyOperationSchema),
  requiresConfirmation: z.boolean(),
  expiresAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
});

export type Policy = z.infer<typeof policySchema>;

export const createPolicyRequestSchema = z.object({
  clientId: z.string().trim().min(1),
  allowedCategoryKeys: z.array(z.string().trim().min(1)).max(24).default([]),
  deniedCategoryKeys: z.array(z.string().trim().min(1)).max(24).default([]),
  maxSensitivity: memorySensitivitySchema.default("INTERNAL"),
  operations: z.array(policyOperationSchema).min(1).default(["READ"]),
  requiresConfirmation: z.boolean().default(true),
  expiresAt: nullableDatetimeSchema
});

export type CreatePolicyRequest = z.infer<typeof createPolicyRequestSchema>;

export const updatePolicyRequestSchema = z
  .object({
    allowedCategoryKeys: z.array(z.string().trim().min(1)).max(24).optional(),
    deniedCategoryKeys: z.array(z.string().trim().min(1)).max(24).optional(),
    maxSensitivity: memorySensitivitySchema.optional(),
    operations: z.array(policyOperationSchema).min(1).optional(),
    requiresConfirmation: z.boolean().optional(),
    expiresAt: nullableDatetimeSchema
  })
  .strict()
  .refine(requireAtLeastOneField, {
    message: "At least one field is required"
  });

export type UpdatePolicyRequest = z.infer<typeof updatePolicyRequestSchema>;

export const policyResponseSchema = z.object({
  policy: policySchema
});

export type PolicyResponse = z.infer<typeof policyResponseSchema>;

export type PolicyRiskCode =
  | "SENSITIVE_ALLOWED"
  | "RESTRICTED_ALLOWED"
  | "SECRET_ALLOWED"
  | "ALL_CATEGORIES"
  | "MANY_CATEGORIES"
  | "NO_CONFIRMATION"
  | "NO_EXPIRATION"
  | "WRITE_ALLOWED"
  | "EXPORT_ALLOWED";

export type PolicyRiskInput = {
  allowedCategoryCount: number;
  maxSensitivity: z.infer<typeof memorySensitivitySchema>;
  operations: Array<z.infer<typeof policyOperationSchema>>;
  requiresConfirmation: boolean;
  expiresAt: string | Date | null;
};

export function policyRiskFactors(
  policy: PolicyRiskInput,
  categoryTotal: number
): PolicyRiskCode[] {
  const factors: PolicyRiskCode[] = [];
  const allowsAllCategories = policy.allowedCategoryCount === 0;
  const allowsManyCategories =
    categoryTotal > 0 &&
    policy.allowedCategoryCount >= Math.max(3, Math.ceil(categoryTotal / 2));

  if (
    policy.maxSensitivity === "SENSITIVE" ||
    policy.maxSensitivity === "RESTRICTED" ||
    policy.maxSensitivity === "SECRET"
  ) {
    factors.push(`${policy.maxSensitivity}_ALLOWED`);
  }

  if (allowsAllCategories || allowsManyCategories) {
    factors.push(allowsAllCategories ? "ALL_CATEGORIES" : "MANY_CATEGORIES");
  }

  if (!policy.requiresConfirmation) {
    factors.push("NO_CONFIRMATION");
  }

  if (!policy.expiresAt) {
    factors.push("NO_EXPIRATION");
  }

  if (policy.operations.includes("WRITE")) {
    factors.push("WRITE_ALLOWED");
  }

  if (policy.operations.includes("EXPORT")) {
    factors.push("EXPORT_ALLOWED");
  }

  return factors;
}

export const listPoliciesQuerySchema = paginationQuerySchema.extend({
  clientId: z.string().trim().min(1).optional()
});

export type ListPoliciesQuery = z.infer<typeof listPoliciesQuerySchema>;

export const listPoliciesResponseSchema = z.object({
  items: z.array(policySchema),
  pagination: paginationSchema
});

export type ListPoliciesResponse = z.infer<typeof listPoliciesResponseSchema>;

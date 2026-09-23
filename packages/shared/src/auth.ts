import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string().min(1),
  timestamp: z.iso.datetime()
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const authUserSchema = z.object({
  id: z.string().min(1),
  email: z.email(),
  displayName: z.string().nullable(),
  role: z.enum(["USER", "ADMIN", "OWNER"])
});

export type AuthUser = z.infer<typeof authUserSchema>;

export const loginOptionsSchema = z.object({
  demoLoginEnabled: z.boolean()
});

export const authResponseSchema = z.object({
  user: authUserSchema
});

export type AuthResponse = z.infer<typeof authResponseSchema>;

export const updateProfileRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(120).nullable().optional()
});

export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

export const deleteAccountRequestSchema = z.object({
  confirmation: z.literal("DELETE")
});

export type DeleteAccountRequest = z.infer<typeof deleteAccountRequestSchema>;

export const okResponseSchema = z.object({
  ok: z.literal(true)
});

export type OkResponse = z.infer<typeof okResponseSchema>;

export type LoginOptions = z.infer<typeof loginOptionsSchema>;

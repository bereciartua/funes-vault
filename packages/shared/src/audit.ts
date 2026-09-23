import { z } from "zod";

import { jsonRecordSchema } from "./common.js";
import { paginationQuerySchema, paginationSchema } from "./common.js";
import {
  auditActorTypeSchema,
  auditEventTypeSchema,
  auditSubjectRoleSchema,
  auditSubjectTypeSchema
} from "./enums.js";

export const auditEventSubjectSchema = z.object({
  type: auditSubjectTypeSchema,
  id: z.string().min(1),
  role: auditSubjectRoleSchema,
  label: z.string().nullable(),
  metadata: jsonRecordSchema
});

export type AuditEventSubject = z.infer<typeof auditEventSubjectSchema>;

export const auditEventSchema = z.object({
  id: z.string().min(1),
  type: auditEventTypeSchema,
  actorType: auditActorTypeSchema,
  actorId: z.string().nullable(),
  clientId: z.string().nullable(),
  clientName: z.string().nullable(),
  memoryRequestId: z.string().nullable(),
  metadata: jsonRecordSchema,
  subjects: z.array(auditEventSubjectSchema).default([]),
  createdAt: z.iso.datetime()
});

export type AuditEvent = z.infer<typeof auditEventSchema>;

export const listAuditEventsQuerySchema = paginationQuerySchema.extend({
  type: auditEventTypeSchema.optional(),
  clientId: z.string().trim().min(1).optional()
});

export type ListAuditEventsQuery = z.infer<typeof listAuditEventsQuerySchema>;

export const auditEventResponseSchema = z.object({
  auditEvent: auditEventSchema
});

export type AuditEventResponse = z.infer<typeof auditEventResponseSchema>;

export const listAuditEventsResponseSchema = z.object({
  items: z.array(auditEventSchema),
  pagination: paginationSchema
});

export type ListAuditEventsResponse = z.infer<
  typeof listAuditEventsResponseSchema
>;

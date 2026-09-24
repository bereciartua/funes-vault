import { z } from "zod";

export const memoryKindSchema = z.enum([
  "FACT",
  "PREFERENCE",
  "INSTRUCTION",
  "GOAL",
  "PROJECT_CONTEXT",
  "RELATIONSHIP",
  "CONSTRAINT",
  "EVENT",
  "SUMMARY"
]);

export const memorySensitivitySchema = z.enum([
  "PUBLIC",
  "LOW",
  "INTERNAL",
  "SENSITIVE",
  "RESTRICTED",
  "SECRET"
]);

export const memoryStatusSchema = z.enum([
  "SUGGESTED",
  "ACTIVE",
  "ARCHIVED",
  "EXPIRED",
  "DELETED"
]);

export const reviewStateSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]);

export const sourceTypeSchema = z.enum([
  "MANUAL",
  "IMPORT",
  "CHAT",
  "CLIENT_SUGGESTION",
  "CONSOLIDATION",
  "API",
  "DERIVED"
]);

export const clientTypeSchema = z.enum([
  "LOCAL_AGENT",
  "MCP_CLIENT",
  "CLI",
  "WEB_APP",
  "BROWSER_EXTENSION",
  "HOSTED_APP",
  "OTHER"
]);

export const clientTrustLevelSchema = z.enum([
  "UNKNOWN",
  "APPROVED",
  "BLOCKED"
]);

export const clientRetentionSchema = z.enum([
  "NO_STORAGE",
  "SESSION",
  "PERSISTENT",
  "UNKNOWN"
]);

export const policyOperationSchema = z.enum([
  "READ",
  "SUGGEST",
  "WRITE",
  "SUMMARIZE",
  "EXPORT"
]);

export const memoryRequestReasonSchema = z.enum([
  "unknown_or_blocked_client",
  "no_client_policy",
  "policy_expired",
  "operation_not_allowed",
  "no_matching_memories",
  "no_allowed_memories",
  "confirmation_required",
  "policy_changed",
  "inactive_memory",
  "unapproved_memory",
  "expired_memory",
  "above_sensitivity_ceiling",
  "denied_category",
  "category_not_allowed"
]);
export const MemoryRequestReason = memoryRequestReasonSchema.enum;
export type MemoryRequestReason = z.infer<typeof memoryRequestReasonSchema>;

export const memoryRequestStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "NEEDS_USER_APPROVAL",
  "DENIED",
  "FULFILLED",
  "FAILED"
]);

export const memorySuggestionStatusSchema = z.enum([
  "QUEUED_FOR_REVIEW",
  "APPROVED",
  "REJECTED",
  "APPLIED",
  "DISMISSED"
]);

export const auditEventTypeSchema = z.enum([
  "MEMORY_PROCESSING_COMPLETED",
  "PROCESSING_CONSENT_UPDATED",
  "MEMORY_CREATED",
  "MEMORY_UPDATED",
  "MEMORY_ARCHIVED",
  "MEMORY_DELETED",
  "MEMORY_DISCLOSURE",
  "MEMORY_REQUEST_APPROVED",
  "MEMORY_REQUEST_DENIED",
  "MEMORY_SUGGESTION_CREATED",
  "MEMORY_SUGGESTION_DENIED",
  "MEMORY_SUGGESTION_APPROVED",
  "MEMORY_SUGGESTION_REJECTED",
  "CLIENT_CREATED",
  "CLIENT_UPDATED",
  "CLIENT_TOKEN_ROTATED",
  "POLICY_CREATED",
  "POLICY_UPDATED",
  "POLICY_DELETED",
  "OAUTH_GRANT_APPROVED",
  "OAUTH_GRANT_DENIED",
  "OAUTH_TOKEN_ISSUED",
  "OAUTH_TOKEN_REVOKED",
  "JOB_CREATED",
  "JOB_COMPLETED",
  "JOB_FAILED"
]);

export const auditActorTypeSchema = z.enum(["USER", "CLIENT", "SYSTEM", "JOB"]);

export const memoryProvenanceEntryTypeSchema = z.enum([
  "CREATED",
  "IMPORTED",
  "SUGGESTED",
  "SOURCE_UPDATED",
  "CONTENT_UPDATED",
  "STATUS_CHANGED",
  "ARCHIVED",
  "RESTORED",
  "DELETED",
  "CONSOLIDATION_INSPECTED",
  "CONSOLIDATION_SUGGESTED",
  "CONSOLIDATION_APPLIED",
  "DERIVED"
]);

export const provenanceSubjectTypeSchema = z.enum([
  "MEMORY",
  "MEMORY_SUGGESTION",
  "JOB_RUN",
  "AUDIT_EVENT",
  "MEMORY_REQUEST",
  "CLIENT",
  "POLICY",
  "IMPORT",
  "PROVIDER"
]);

export const provenanceSubjectRoleSchema = z.enum([
  "TARGET",
  "SOURCE",
  "CANONICAL",
  "SUPERSEDED_BY",
  "DUPLICATE_OF",
  "CONFLICTS_WITH",
  "DERIVED_FROM",
  "DERIVED_OUTPUT",
  "SUGGESTION",
  "JOB",
  "AUDIT_EVENT",
  "REQUEST",
  "CLIENT",
  "POLICY",
  "IMPORT_SOURCE",
  "MODEL_PROVIDER"
]);

export const auditSubjectTypeSchema = z.enum([
  "MEMORY",
  "MEMORY_SUGGESTION",
  "JOB_RUN",
  "MEMORY_REQUEST",
  "CLIENT",
  "POLICY",
  "IMPORT",
  "EXPORT"
]);

export const auditSubjectRoleSchema = z.enum([
  "TARGET",
  "SOURCE",
  "CANONICAL",
  "DISCLOSED",
  "DENIED",
  "CREATED",
  "UPDATED",
  "ARCHIVED",
  "DELETED",
  "SUGGESTION",
  "JOB",
  "REQUEST",
  "CLIENT",
  "POLICY",
  "IMPORTED",
  "EXPORTED"
]);

export const jobTypeSchema = z.enum([
  "GENERATE_EMBEDDING",
  "PROCESS_IMPORT",
  "CONSOLIDATE_MEMORIES",
  "DETECT_CONFLICTS",
  "SEND_REVIEW_REMINDER"
]);

export const jobStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED"
]);

export const consolidationModeSchema = z.enum(["REVIEW_ONLY", "AUTO_APPLY"]);

export type MemoryKind = z.infer<typeof memoryKindSchema>;

export type MemorySensitivity = z.infer<typeof memorySensitivitySchema>;

export type MemoryStatus = z.infer<typeof memoryStatusSchema>;

export type ReviewState = z.infer<typeof reviewStateSchema>;

export type SourceType = z.infer<typeof sourceTypeSchema>;

export type ClientType = z.infer<typeof clientTypeSchema>;

export type ClientTrustLevel = z.infer<typeof clientTrustLevelSchema>;

export type ClientRetention = z.infer<typeof clientRetentionSchema>;

export type PolicyOperation = z.infer<typeof policyOperationSchema>;

export type MemoryRequestStatus = z.infer<typeof memoryRequestStatusSchema>;

export type MemorySuggestionStatus = z.infer<
  typeof memorySuggestionStatusSchema
>;

export type AuditEventType = z.infer<typeof auditEventTypeSchema>;

export type AuditActorType = z.infer<typeof auditActorTypeSchema>;

export type MemoryProvenanceEntryType = z.infer<
  typeof memoryProvenanceEntryTypeSchema
>;

export type ProvenanceSubjectType = z.infer<typeof provenanceSubjectTypeSchema>;

export type ProvenanceSubjectRole = z.infer<typeof provenanceSubjectRoleSchema>;

export type AuditSubjectType = z.infer<typeof auditSubjectTypeSchema>;

export type AuditSubjectRole = z.infer<typeof auditSubjectRoleSchema>;

export type JobType = z.infer<typeof jobTypeSchema>;

export type JobStatus = z.infer<typeof jobStatusSchema>;

export type ConsolidationMode = z.infer<typeof consolidationModeSchema>;

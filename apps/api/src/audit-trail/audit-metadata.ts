/** Subject keys understood by the audit recorder. Extra event details are retained as JSON. */
type SubjectMetadata = {
  memoryId?: string | null;
  targetMemoryId?: string | null;
  targetTitle?: string | null;
  canonicalMemoryId?: string | null;
  canonicalTitle?: string | null;
  memoryIds?: string[];
  denied?: { memoryId: string; reason?: string | null }[];
  suggestionId?: string | null;
  jobRunId?: string | null;
  requestId?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  policyId?: string | null;
  statedPurpose?: string | null;
  policyLabel?: string | null;
  importedMemoryId?: string | null;
  sourceExportedAt?: string | null;
  type?: string;
  [detail: string]: unknown;
};

type MemoryAuditMetadata = SubjectMetadata & { changedFields?: string[] };
type DisclosureAuditMetadata = SubjectMetadata & { tokenBudget?: number };
type ClientAuditMetadata = SubjectMetadata & { scopes?: string[] };
type JobAuditMetadata = SubjectMetadata & { error?: string | null };
type ProcessingAuditMetadata = SubjectMetadata & {
  runId?: string;
  processor?: string;
};

export type AuditMetadata =
  | MemoryAuditMetadata
  | DisclosureAuditMetadata
  | ClientAuditMetadata
  | JobAuditMetadata
  | ProcessingAuditMetadata;

import {
  type AuditActorType,
  type AuditEventType,
  AuditSubjectRole,
  AuditSubjectType,
  type MemoryProvenanceEntry,
  MemoryProvenanceEntryType,
  type MemoryProvenanceSubject,
  type Prisma,
  ProvenanceSubjectRole,
  ProvenanceSubjectType,
  type SourceType
} from "@funes-vault/db";

import type { AuditMetadata } from "./audit-metadata.js";

export type AuditSubjectInput = {
  type: AuditSubjectType;
  id: string | null | undefined;
  role: AuditSubjectRole;
  label?: string | null;
  metadata?: Record<string, unknown>;
};

export type ProvenanceSubjectInput = {
  type: ProvenanceSubjectType;
  id: string | null | undefined;
  role: ProvenanceSubjectRole;
  label?: string | null;
  metadata?: Record<string, unknown>;
};

export type AuditEventTx = Pick<
  Prisma.TransactionClient,
  "auditEvent" | "auditEventSubject"
>;

export type ProvenanceTx = Pick<
  Prisma.TransactionClient,
  "memoryProvenanceEntry" | "memoryProvenanceSubject"
>;

export type CreateAuditEventInput = {
  userId: string;
  clientId?: string | null;
  memoryRequestId?: string | null;
  type: AuditEventType;
  actorType: AuditActorType;
  actorId?: string | null;
  metadata?: AuditMetadata;
  subjects?: AuditSubjectInput[];
  inferSubjects?: boolean;
};

export type CreateMemoryProvenanceInput = {
  userId: string;
  memoryId: string;
  type: MemoryProvenanceEntryType;
  actorType: AuditActorType;
  actorId?: string | null;
  sourceType?: SourceType | null;
  sourceClientId?: string | null;
  sourceUri?: string | null;
  suggestionId?: string | null;
  jobRunId?: string | null;
  auditEventId?: string | null;
  memoryRequestId?: string | null;
  reason?: string | null;
  evidence?: string | null;
  confidence?: number | null;
  metadata?: Record<string, unknown>;
  subjects?: ProvenanceSubjectInput[];
};

export type MemoryProvenanceEntryWithSubjects = MemoryProvenanceEntry & {
  subjects: MemoryProvenanceSubject[];
};

export type AuditEventSubjectResponse = {
  type: AuditSubjectType;
  id: string;
  role: AuditSubjectRole;
  label: string | null;
  metadata: Record<string, unknown>;
};

export type ProvenanceSubjectResponse = {
  type: ProvenanceSubjectType;
  id: string;
  role: ProvenanceSubjectRole;
  label: string | null;
  metadata: Record<string, unknown>;
  memoryStatus: string | null;
  memorySensitivity: string | null;
};

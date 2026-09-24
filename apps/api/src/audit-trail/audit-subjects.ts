import {
  type AuditEventSubject,
  type AuditEventType,
  AuditSubjectRole,
  AuditSubjectType,
  type MemoryProvenanceSubject,
  ProvenanceSubjectRole,
  ProvenanceSubjectType
} from "@funes-vault/db";

import { getObjectMetadata } from "../common/serialization.js";
import type { AuditMetadata } from "./audit-metadata.js";
import type {
  AuditEventSubjectResponse,
  AuditSubjectInput,
  CreateAuditEventInput,
  ProvenanceSubjectInput,
  ProvenanceSubjectResponse
} from "./audit-trail.types.js";

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function shortId(value: string) {
  return value.length > 10 ? `${value.slice(0, 8)}...` : value;
}

function auditMemoryRole(type: AuditEventType) {
  switch (type) {
    case "MEMORY_CREATED":
      return AuditSubjectRole.CREATED;
    case "MEMORY_UPDATED":
      return AuditSubjectRole.UPDATED;
    case "MEMORY_ARCHIVED":
      return AuditSubjectRole.ARCHIVED;
    case "MEMORY_DELETED":
      return AuditSubjectRole.DELETED;
    default:
      return AuditSubjectRole.TARGET;
  }
}

export function dedupeSubjects<
  T extends AuditSubjectInput | ProvenanceSubjectInput
>(subjects: T[]) {
  const byKey = new Map<string, T>();

  for (const subject of subjects) {
    if (!subject.id) {
      continue;
    }
    const key = `${subject.type}:${subject.id}:${subject.role}`;
    const existing = byKey.get(key);

    byKey.set(key, {
      ...subject,
      label: subject.label ?? existing?.label ?? null,
      metadata: {
        ...(existing?.metadata ?? {}),
        ...(subject.metadata ?? {})
      }
    });
  }

  return [...byKey.values()];
}

export function toAuditSubjectResponse(
  subject: AuditEventSubject
): AuditEventSubjectResponse {
  return {
    type: subject.subjectType,
    id: subject.subjectId,
    role: subject.role,
    label: subject.labelSnapshot,
    metadata: getObjectMetadata(subject.metadata)
  };
}

export function toProvenanceSubjectResponse(
  subject: MemoryProvenanceSubject,
  memoryDetails: Map<
    string,
    { title: string; status: string; sensitivity: string }
  > = new Map()
): ProvenanceSubjectResponse {
  const memory = memoryDetails.get(subject.subjectId);

  return {
    type: subject.subjectType,
    id: subject.subjectId,
    role: subject.role,
    label: subject.labelSnapshot ?? memory?.title ?? null,
    metadata: getObjectMetadata(subject.metadata),
    memoryStatus:
      subject.subjectType === "MEMORY" ? (memory?.status ?? null) : null,
    memorySensitivity:
      subject.subjectType === "MEMORY" ? (memory?.sensitivity ?? null) : null
  };
}

export function inferAuditSubjects(
  input: CreateAuditEventInput,
  metadata: AuditMetadata
): AuditSubjectInput[] {
  const subjects: AuditSubjectInput[] = [];
  const memoryId = metadata.memoryId;
  const targetMemoryId = metadata.targetMemoryId;
  const canonicalMemoryId = metadata.canonicalMemoryId;
  const suggestionId = metadata.suggestionId;
  const jobRunId = metadata.jobRunId;
  const requestId = metadata.requestId ?? stringValue(input.memoryRequestId);
  const clientId = metadata.clientId ?? stringValue(input.clientId);
  const policyId = metadata.policyId;
  const importedMemoryId = metadata.importedMemoryId;

  if (memoryId) {
    subjects.push({
      type: AuditSubjectType.MEMORY,
      id: memoryId,
      role: auditMemoryRole(input.type)
    });
  }

  if (targetMemoryId) {
    subjects.push({
      type: AuditSubjectType.MEMORY,
      id: targetMemoryId,
      role: AuditSubjectRole.TARGET,
      label: metadata.targetTitle
    });
  }

  if (canonicalMemoryId) {
    subjects.push({
      type: AuditSubjectType.MEMORY,
      id: canonicalMemoryId,
      role: AuditSubjectRole.CANONICAL,
      label: metadata.canonicalTitle
    });
  }

  for (const id of (metadata.memoryIds ?? []).filter(Boolean)) {
    subjects.push({
      type: AuditSubjectType.MEMORY,
      id,
      role:
        input.type === "MEMORY_DISCLOSURE"
          ? AuditSubjectRole.DISCLOSED
          : AuditSubjectRole.TARGET
    });
  }

  for (const denied of metadata.denied ?? []) {
    const deniedMetadata = denied;
    const deniedMemoryId = deniedMetadata.memoryId;
    if (!deniedMemoryId) {
      continue;
    }

    subjects.push({
      type: AuditSubjectType.MEMORY,
      id: deniedMemoryId,
      role: AuditSubjectRole.DENIED,
      metadata: {
        reason: deniedMetadata.reason ?? null
      }
    });
  }

  if (suggestionId) {
    subjects.push({
      type: AuditSubjectType.MEMORY_SUGGESTION,
      id: suggestionId,
      role: AuditSubjectRole.SUGGESTION
    });
  }

  if (jobRunId) {
    subjects.push({
      type: AuditSubjectType.JOB_RUN,
      id: jobRunId,
      role: AuditSubjectRole.JOB,
      label: metadata.type ?? `Job ${shortId(jobRunId)}`
    });
  }

  if (requestId) {
    subjects.push({
      type: AuditSubjectType.MEMORY_REQUEST,
      id: requestId,
      role: AuditSubjectRole.REQUEST
    });
  }

  if (clientId) {
    subjects.push({
      type: AuditSubjectType.CLIENT,
      id: clientId,
      role: AuditSubjectRole.CLIENT,
      label: metadata.clientName
    });
  }

  if (policyId) {
    subjects.push({
      type: AuditSubjectType.POLICY,
      id: policyId,
      role: AuditSubjectRole.POLICY,
      label:
        metadata.policyLabel ??
        (typeof metadata.clientName === "string"
          ? `${metadata.clientName} permissions`
          : "App permissions")
    });
  }

  if (importedMemoryId) {
    subjects.push({
      type: AuditSubjectType.IMPORT,
      id: importedMemoryId,
      role: AuditSubjectRole.IMPORTED,
      metadata: {
        sourceExportedAt: metadata.sourceExportedAt
      }
    });
  }

  return subjects;
}
export function memorySubject(
  memory: { id: string; title?: string | null },
  role: ProvenanceSubjectRole
): ProvenanceSubjectInput {
  return {
    type: ProvenanceSubjectType.MEMORY,
    id: memory.id,
    role,
    label: memory.title ?? null
  };
}
export function auditMemorySubject(
  memory: { id: string; title?: string | null },
  role: AuditSubjectRole
): AuditSubjectInput {
  return {
    type: AuditSubjectType.MEMORY,
    id: memory.id,
    role,
    label: memory.title ?? null
  };
}

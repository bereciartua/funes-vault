import {
  AuditSubjectRole,
  AuditSubjectType,
  type MemorySuggestion,
  ProvenanceSubjectRole,
  ProvenanceSubjectType
} from "@funes-vault/db";

import {
  auditMemorySubject,
  memorySubject
} from "../audit-trail/audit-subjects.js";
export function archiveAuditSubjects(input: {
  suggestion: Pick<MemorySuggestion, "id" | "title">;
  target: { id: string; title: string };
  canonical: { id: string; title: string } | null;
  jobRunId: string | null;
}) {
  return [
    auditMemorySubject(input.target, AuditSubjectRole.ARCHIVED),
    {
      type: AuditSubjectType.MEMORY,
      id: input.canonical?.id,
      role: AuditSubjectRole.CANONICAL,
      label: input.canonical?.title ?? null
    },
    {
      type: AuditSubjectType.MEMORY_SUGGESTION,
      id: input.suggestion.id,
      role: AuditSubjectRole.SUGGESTION,
      label: input.suggestion.title
    },
    {
      type: AuditSubjectType.JOB_RUN,
      id: input.jobRunId,
      role: AuditSubjectRole.JOB
    }
  ];
}

export function archiveProvenanceSubjects(input: {
  suggestion: Pick<MemorySuggestion, "id" | "title">;
  target: { id: string; title: string };
  canonical: { id: string; title: string } | null;
  jobRunId: string | null;
  auditEventIds: string[];
}) {
  return [
    memorySubject(input.target, ProvenanceSubjectRole.TARGET),
    {
      type: ProvenanceSubjectType.MEMORY,
      id: input.canonical?.id,
      role: ProvenanceSubjectRole.CANONICAL,
      label: input.canonical?.title ?? null
    },
    {
      type: ProvenanceSubjectType.MEMORY_SUGGESTION,
      id: input.suggestion.id,
      role: ProvenanceSubjectRole.SUGGESTION,
      label: input.suggestion.title
    },
    {
      type: ProvenanceSubjectType.JOB_RUN,
      id: input.jobRunId,
      role: ProvenanceSubjectRole.JOB
    },
    ...input.auditEventIds.map((id) => ({
      type: ProvenanceSubjectType.AUDIT_EVENT,
      id,
      role: ProvenanceSubjectRole.AUDIT_EVENT
    }))
  ];
}

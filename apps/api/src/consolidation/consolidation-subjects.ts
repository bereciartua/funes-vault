import {
  AuditSubjectRole,
  AuditSubjectType,
  JobType,
  ProvenanceSubjectRole,
  ProvenanceSubjectType
} from "@funes-vault/db";

import { memorySubject } from "../audit-trail/audit-subjects.js";
import {
  type ArchiveCandidate,
  type ConsolidationActionSummary
} from "./consolidation.types.js";
export function consolidationArchiveAuditSubjects(input: {
  candidate: ArchiveCandidate;
  jobRunId: string;
  auditRole: AuditSubjectRole;
}) {
  return [
    {
      type: AuditSubjectType.MEMORY,
      id: input.candidate.memory.id,
      role: input.auditRole,
      label: input.candidate.memory.title
    },
    {
      type: AuditSubjectType.MEMORY,
      id: input.candidate.canonicalMemory?.id,
      role: AuditSubjectRole.CANONICAL,
      label: input.candidate.canonicalMemory?.title ?? null
    },
    {
      type: AuditSubjectType.JOB_RUN,
      id: input.jobRunId,
      role: AuditSubjectRole.JOB,
      label: JobType.CONSOLIDATE_MEMORIES
    }
  ];
}

export function consolidationArchiveProvenanceSubjects(input: {
  candidate: ArchiveCandidate;
  suggestionId: string | null;
  jobRunId: string;
  auditEventId: string | null;
}) {
  return [
    memorySubject(input.candidate.memory, ProvenanceSubjectRole.TARGET),
    {
      type: ProvenanceSubjectType.MEMORY,
      id: input.candidate.canonicalMemory?.id,
      role: ProvenanceSubjectRole.CANONICAL,
      label: input.candidate.canonicalMemory?.title ?? null
    },
    {
      type: ProvenanceSubjectType.MEMORY_SUGGESTION,
      id: input.suggestionId,
      role: ProvenanceSubjectRole.SUGGESTION
    },
    {
      type: ProvenanceSubjectType.JOB_RUN,
      id: input.jobRunId,
      role: ProvenanceSubjectRole.JOB
    },
    {
      type: ProvenanceSubjectType.AUDIT_EVENT,
      id: input.auditEventId,
      role: ProvenanceSubjectRole.AUDIT_EVENT
    }
  ];
}

export function consolidationResultAuditSubjects(input: {
  jobRunId: string;
  actions?: ConsolidationActionSummary[];
}) {
  const actions = input.actions ?? [];

  return [
    {
      type: AuditSubjectType.JOB_RUN,
      id: input.jobRunId,
      role: AuditSubjectRole.JOB,
      label: JobType.CONSOLIDATE_MEMORIES
    },
    ...actions.flatMap((action) => [
      {
        type: AuditSubjectType.MEMORY,
        id: action.targetMemoryId,
        role: action.applied
          ? AuditSubjectRole.ARCHIVED
          : AuditSubjectRole.TARGET,
        label: action.targetLabel
      },
      {
        type: AuditSubjectType.MEMORY,
        id: action.canonicalMemoryId,
        role: AuditSubjectRole.CANONICAL,
        label: action.canonicalLabel
      },
      {
        type: AuditSubjectType.MEMORY_SUGGESTION,
        id: action.suggestionId,
        role: AuditSubjectRole.SUGGESTION
      }
    ])
  ];
}

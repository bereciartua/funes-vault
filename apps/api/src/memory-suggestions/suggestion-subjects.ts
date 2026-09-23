import {
  AuditSubjectRole,
  AuditSubjectType,
  type MemorySuggestion,
  ProvenanceSubjectRole,
  ProvenanceSubjectType
} from "@funes-vault/db";

import { memorySubject } from "../audit-trail/audit-subjects.js";
export function suggestionAuditSubjects(input: {
  suggestion: Pick<MemorySuggestion, "id" | "title">;
  clientId: string | null;
  policyId: string | null;
  policyLabel: string | null;
}) {
  return [
    {
      type: AuditSubjectType.MEMORY_SUGGESTION,
      id: input.suggestion.id,
      role: AuditSubjectRole.SUGGESTION,
      label: input.suggestion.title
    },
    {
      type: AuditSubjectType.CLIENT,
      id: input.clientId,
      role: AuditSubjectRole.CLIENT
    },
    {
      type: AuditSubjectType.POLICY,
      id: input.policyId,
      role: AuditSubjectRole.POLICY,
      label: input.policyLabel
    }
  ];
}

export function suggestionProvenanceSubjects(input: {
  memory: { id: string; title: string };
  suggestion: Pick<MemorySuggestion, "id" | "title">;
  clientId: string | null;
  policyId: string | null;
  auditEventIds: string[];
}) {
  return [
    memorySubject(input.memory, ProvenanceSubjectRole.TARGET),
    {
      type: ProvenanceSubjectType.MEMORY_SUGGESTION,
      id: input.suggestion.id,
      role: ProvenanceSubjectRole.SUGGESTION,
      label: input.suggestion.title
    },
    {
      type: ProvenanceSubjectType.CLIENT,
      id: input.clientId,
      role: ProvenanceSubjectRole.CLIENT
    },
    {
      type: ProvenanceSubjectType.POLICY,
      id: input.policyId,
      role: ProvenanceSubjectRole.POLICY
    },
    ...input.auditEventIds.map((id) => ({
      type: ProvenanceSubjectType.AUDIT_EVENT,
      id,
      role: ProvenanceSubjectRole.AUDIT_EVENT
    }))
  ];
}

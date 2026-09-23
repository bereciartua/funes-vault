import type { AuditEventSubject, ProvenanceSubject } from "@funes-vault/shared";

import { routes } from "../routes";
export type SubjectLike = Pick<
  AuditEventSubject | ProvenanceSubject,
  "type" | "id" | "role" | "label" | "metadata"
> & {
  memoryStatus?: string | null;
  memorySensitivity?: string | null;
};

export function subjectHref(subject: SubjectLike) {
  if (subject.type === "AUDIT_EVENT") {
    return routes.auditEvent(subject.id);
  }

  if (subject.type === "MEMORY") {
    return routes.memory(subject.id);
  }

  if (subject.type === "JOB_RUN") {
    return routes.settings("jobs");
  }

  if (subject.type === "MEMORY_SUGGESTION") {
    return "/inbox";
  }

  if (subject.type === "MEMORY_REQUEST") {
    return routes.request(subject.id);
  }

  return null;
}

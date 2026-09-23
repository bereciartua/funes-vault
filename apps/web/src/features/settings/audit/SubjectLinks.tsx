"use client";
import { type AuditEventSubject } from "@funes-vault/shared";
import Link from "next/link";

import { subjectDisplayLabel } from "../../../lib/domain/labels";
import { subjectHref } from "../../../lib/domain/subject-links";

export function SubjectLinks({
  leadingDash = true,
  subjects
}: {
  leadingDash?: boolean;
  subjects: AuditEventSubject[];
}) {
  if (subjects.length === 0) {
    return null;
  }
  const visible = subjects.slice(0, 3);

  return (
    <>
      {leadingDash ? " — " : null}
      {visible.map((subject, index) => {
        const href = subjectHref(subject);
        const content = subjectDisplayLabel(subject);

        return (
          <span key={`${subject.type}-${subject.id}-${subject.role}`}>
            {index > 0 ? " · " : null}
            {href ? <Link href={href}>{content}</Link> : content}
          </span>
        );
      })}
      {subjects.length > visible.length
        ? ` · and ${subjects.length - visible.length} more`
        : null}
    </>
  );
}

import Link from "next/link";

import { label, subjectDisplayLabel } from "../lib/domain/labels";
import { subjectHref, type SubjectLike } from "../lib/domain/subject-links";

type SubjectChipsProps = {
  subjects: SubjectLike[];
  interactive?: boolean;
};

export function SubjectChips({
  interactive = true,
  subjects
}: SubjectChipsProps) {
  if (subjects.length === 0) {
    return null;
  }

  return (
    <div className="subject-chip-row">
      {subjects.map((subject) => (
        <SubjectChip
          key={`${subject.type}-${subject.id}-${subject.role}`}
          interactive={interactive}
          subject={subject}
        />
      ))}
    </div>
  );
}

function SubjectChip({
  interactive = true,
  subject
}: {
  interactive?: boolean;
  subject: SubjectLike;
}) {
  const content = (
    <>
      <span>{label(subject.role)}</span>
      <strong>{subjectDisplayLabel(subject)}</strong>
    </>
  );
  const href = interactive ? subjectHref(subject) : null;

  if (!href) {
    return (
      <span className="subject-chip" data-subject-type={subject.type}>
        {content}
      </span>
    );
  }

  return (
    <Link className="subject-chip" data-subject-type={subject.type} href={href}>
      {content}
    </Link>
  );
}

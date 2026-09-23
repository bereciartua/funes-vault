import type { AuditEventSubject, JobRun } from "@funes-vault/shared";
type Action = NonNullable<JobRun["consolidation"]>["actions"][number];
export function consolidationActionSubjects(
  action: Action
): AuditEventSubject[] {
  return [
    {
      type: "MEMORY",
      id: action.targetMemoryId,
      role: action.applied ? "ARCHIVED" : "TARGET",
      label: action.targetLabel,
      metadata: {}
    },
    ...(action.canonicalMemoryId
      ? [
          {
            type: "MEMORY" as const,
            id: action.canonicalMemoryId,
            role: "CANONICAL" as const,
            label: action.canonicalLabel,
            metadata: {}
          }
        ]
      : []),
    ...(action.suggestionId
      ? [
          {
            type: "MEMORY_SUGGESTION" as const,
            id: action.suggestionId,
            role: "SUGGESTION" as const,
            label: "Review suggestion",
            metadata: {}
          }
        ]
      : [])
  ];
}

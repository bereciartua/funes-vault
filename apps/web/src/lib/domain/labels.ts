import type {
  AuditEventSubject,
  Client,
  ProvenanceSubject
} from "@funes-vault/shared";
export function label(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
export function joinWithAnd(parts: string[]) {
  if (parts.length <= 1) {
    return parts.join("");
  }
  if (parts.length === 2) {
    return `${parts[0]} and ${parts[1]}`;
  }

  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}
export type SubjectLike = Pick<
  AuditEventSubject | ProvenanceSubject,
  "type" | "id" | "role" | "label" | "metadata"
>;
const jobTypeLabels: Record<string, string> = {
  CONSOLIDATE_MEMORIES: "Consolidate memories",
  DETECT_CONFLICTS: "Detect conflicts",
  GENERATE_EMBEDDING: "Generate embedding",
  PROCESS_IMPORT: "Process import",
  SEND_REVIEW_REMINDER: "Send review reminder"
};
export function jobTypeLabel(value: string) {
  const normalized = normalizeConstant(value);

  return jobTypeLabels[normalized] ?? label(normalized);
}
export function subjectDisplayLabel(subject: SubjectLike) {
  if (subject.type === "JOB_RUN") {
    return jobSubjectLabel(subject);
  }

  if (subject.label) {
    return /^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(subject.label)
      ? label(subject.label)
      : subject.label;
  }

  return `${label(subject.type)} ${shortId(subject.id)}`;
}
export function subjectAffectedLabel(subject: SubjectLike) {
  if (subject.type === "JOB_RUN") {
    return `${subjectDisplayLabel(subject)} job`;
  }

  if (subject.type === "MEMORY" || subject.type === "MEMORY_SUGGESTION") {
    return subject.label
      ? `“${subject.label}”`
      : `${label(subject.type)} ${shortId(subject.id)}`;
  }

  return subjectDisplayLabel(subject);
}
const clientTypeLabels: Record<Client["type"], string> = {
  LOCAL_AGENT: "Local agent",
  MCP_CLIENT: "MCP client",
  CLI: "CLI",
  WEB_APP: "Web app",
  BROWSER_EXTENSION: "Browser extension",
  HOSTED_APP: "Hosted app",
  OTHER: "Other"
};
export function clientTypeLabel(type: Client["type"]) {
  return clientTypeLabels[type] ?? label(type);
}
export function captureSourceLabel(sourceType: string) {
  const labels: Record<string, string> = {
    MANUAL: "manually",
    CHAT: "in chat",
    IMPORT: "by import",
    MCP: "through MCP",
    API: "through the API",
    CONSOLIDATION: "by consolidation"
  };

  return labels[sourceType] ?? label(sourceType).toLowerCase();
}
function jobSubjectLabel(subject: SubjectLike) {
  const candidates = [
    subject.label,
    metadataString(subject.metadata, "jobType"),
    metadataString(subject.metadata, "type")
  ];

  for (const candidate of candidates) {
    if (candidate) {
      return jobTypeLabel(stripJobPrefix(candidate));
    }
  }

  return `Job run ${shortId(subject.id)}`;
}
function stripJobPrefix(value: string) {
  return value.trim().replace(/^job\s+/i, "");
}
function normalizeConstant(value: string) {
  return value
    .trim()
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
}
export function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];

  return typeof value === "string" && value.trim() ? value : null;
}
export function shortId(value: string) {
  return value.length > 10 ? `${value.slice(0, 8)}...` : value;
}

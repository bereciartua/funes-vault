import type { AuditEvent } from "@funes-vault/shared";

import { BadgeDescriptor } from "../badge-types";
import {
  label,
  metadataString,
  shortId,
  subjectAffectedLabel,
  subjectDisplayLabel
} from "./labels";
function auditEventDescriptor(event: AuditEvent): BadgeDescriptor {
  if (
    event.type === "MEMORY_DISCLOSURE" ||
    event.type === "CLIENT_TOKEN_ROTATED"
  ) {
    return { icon: "ShieldAlert", label: label(event.type), tone: "risk" };
  }

  if (
    event.type === "MEMORY_DELETED" ||
    event.type === "POLICY_DELETED" ||
    event.type === "JOB_FAILED"
  ) {
    return { icon: "OctagonAlert", label: label(event.type), tone: "danger" };
  }

  if (event.type.includes("POLICY") || event.type.includes("CLIENT")) {
    return { icon: "KeyRound", label: label(event.type), tone: "attention" };
  }

  if (event.type.includes("SUGGESTION")) {
    return { icon: "Inbox", label: label(event.type), tone: "info" };
  }

  return { icon: "Activity", label: label(event.type), tone: "neutral" };
}
export function auditEventSummary(event: AuditEvent) {
  const descriptor = auditEventDescriptor(event);
  const actor = auditActorLabel(event);
  const memoryId = metadataString(event.metadata, "memoryId");
  const policyId = metadataString(event.metadata, "policyId");
  const clientId = event.clientId ?? metadataString(event.metadata, "clientId");
  const primarySubject = event.subjects.find((subject) =>
    [
      "MEMORY",
      "MEMORY_SUGGESTION",
      "CLIENT",
      "POLICY",
      "JOB_RUN",
      "MEMORY_REQUEST"
    ].includes(subject.type)
  );
  const affected = primarySubject
    ? subjectAffectedLabel(primarySubject)
    : memoryId
      ? `Memory ${shortId(memoryId)}`
      : policyId
        ? `Policy ${shortId(policyId)}`
        : clientId
          ? `Client ${shortId(clientId)}`
          : event.memoryRequestId
            ? `Request ${shortId(event.memoryRequestId)}`
            : "Vault";

  return {
    affected,
    actor,
    description: auditEventDescription(event, actor, affected),
    title: descriptor.label,
    tone: descriptor.tone
  };
}
function auditActorLabel(event: AuditEvent) {
  if (event.actorType === "USER") {
    return "You";
  }
  if (event.actorType === "JOB") {
    return "Job runner";
  }
  if (event.actorType === "SYSTEM") {
    return "System";
  }

  return event.clientName ?? "A client";
}
const memoryEventVerbs: Partial<Record<AuditEvent["type"], string>> = {
  MEMORY_CREATED: "created",
  MEMORY_UPDATED: "updated",
  MEMORY_ARCHIVED: "archived",
  MEMORY_DELETED: "deleted",
  MEMORY_SUGGESTION_CREATED: "suggested a new memory:",
  MEMORY_SUGGESTION_APPROVED: "approved the suggestion",
  MEMORY_SUGGESTION_REJECTED: "rejected the suggestion"
};
function auditEventDescription(
  event: AuditEvent,
  actor: string,
  affected: string
) {
  const jobVerb = jobEventVerb(event.type);

  if (jobVerb) {
    const jobSubject = event.subjects.find(
      (subject) => subject.type === "JOB_RUN"
    );
    const memorySubject = event.subjects.find(
      (subject) => subject.type === "MEMORY"
    );
    const jobName = jobSubject ? subjectDisplayLabel(jobSubject) : "background";
    const target = memorySubject
      ? ` for ${subjectAffectedLabel(memorySubject)}`
      : "";

    return `${actor} ${jobVerb} the ${jobName} job${target}.`;
  }

  if (event.type === "MEMORY_DISCLOSURE") {
    const purpose = metadataString(event.metadata, "purpose");
    const purposeText = purpose ? ` for ${label(purpose).toLowerCase()}` : "";

    return `${actor} received ${affected}${purposeText}.`;
  }

  if (event.type === "CLIENT_TOKEN_ROTATED") {
    return `${actor} rotated the access token for ${affected === "Vault" ? "a client" : affected}.`;
  }

  if (event.type === "CLIENT_CREATED" || event.type === "CLIENT_UPDATED") {
    const verb = event.type === "CLIENT_CREATED" ? "registered" : "updated";
    const client = affected === "Vault" ? "a client" : `the client ${affected}`;

    return `${actor} ${verb} ${client}.`;
  }

  if (event.type.startsWith("POLICY_")) {
    const verb =
      event.type === "POLICY_CREATED"
        ? "created"
        : event.type === "POLICY_UPDATED"
          ? "updated"
          : "deleted";

    return `${actor} ${verb} a disclosure policy.`;
  }

  const memoryVerb = memoryEventVerbs[event.type];

  if (memoryVerb) {
    return `${actor} ${memoryVerb} ${affected}.`;
  }

  return `${label(event.type)} — ${affected} (${actor}).`;
}
function jobEventVerb(type: AuditEvent["type"]) {
  if (type === "JOB_CREATED") {
    return "started";
  }
  if (type === "JOB_COMPLETED") {
    return "completed";
  }
  if (type === "JOB_FAILED") {
    return "failed";
  }

  return null;
}

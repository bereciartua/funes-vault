import {
  type AuditEvent,
  memoryRequestReasonLabel,
  memoryRequestReasonSchema
} from "@funes-vault/shared";
import Link from "next/link";
import type { ReactNode } from "react";

import { formatDateTime } from "../../../lib/dates";
export function auditFacts(event: AuditEvent): Array<[string, ReactNode]> {
  const metadata = event.metadata;
  const facts: Array<[string, ReactNode]> = [];
  if ("statedPurpose" in metadata || "purpose" in metadata) {
    const purpose = metadata.statedPurpose ?? metadata.purpose;
    facts.push([
      "Stated purpose",
      typeof purpose === "string" ? purpose : "Not provided"
    ]);
  }
  if ("policyId" in metadata) {
    facts.push([
      "App permissions",
      metadata.policyId ? (
        <Link href="/settings/clients">
          {event.clientName
            ? `${event.clientName} permissions`
            : "Manage app permissions"}
        </Link>
      ) : (
        "No permission binding"
      )
    ]);
  }
  if ("policyVersion" in metadata && metadata.policyVersion) {
    facts.push([
      "Permission version",
      formatDateTime(String(metadata.policyVersion))
    ]);
  }
  for (const [title, key] of [
    ["Operation", "operation"],
    ["Task", "task"]
  ] as const) {
    if (key in metadata && metadata[key] !== null) {
      facts.push([title, String(metadata[key])]);
    }
  }
  if ("decision" in metadata) {
    const decisions: Record<string, string> = {
      ALLOW: "Allowed",
      DENY: "Denied",
      NEEDS_CONFIRMATION: "Needs confirmation",
      REQUIRE_CONFIRMATION: "Needs confirmation"
    };
    facts.push([
      "Decision",
      decisions[String(metadata.decision)] ?? "Not recorded"
    ]);
  }
  const reason = memoryRequestReasonSchema.safeParse(metadata.reason);
  if (reason.success) {
    facts.push(["Reason", memoryRequestReasonLabel(reason.data)]);
  } else if (
    metadata.reason === null &&
    metadata.policyVersion === null &&
    metadata.decision !== "ALLOW" &&
    event.actorType !== "USER"
  ) {
    facts.push(["Reason", "Not evaluated"]);
  }
  if (typeof metadata.requiresConfirmation === "boolean") {
    facts.push([
      "Confirmation required",
      metadata.requiresConfirmation ? "Yes" : "No"
    ]);
  }

  return facts;
}

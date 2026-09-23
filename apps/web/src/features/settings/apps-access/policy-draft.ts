export { sensitivities } from "../../../lib/domain/sensitivity";
import type { Client, Policy } from "@funes-vault/shared";

import { toDateInputValue } from "../../../lib/dates";
export type ClientDraft = {
  name: string;
  type: Client["type"];
  trustLevel: Client["trustLevel"];
  declaredRetention: Client["declaredRetention"];
};

export type PolicyDraft = {
  purpose: string;
  allowedCategoryKeys: string[];
  deniedCategoryKeys: string[];
  maxSensitivity: Policy["maxSensitivity"];
  operations: Policy["operations"];
  requiresConfirmation: boolean;
  expiresAt: string;
};

export type EditorMode = "create" | "edit";

export type PolicyEditorState =
  { mode: "create" } | { mode: "edit"; policyId: string } | null;

export const clientTypes: Client["type"][] = [
  "LOCAL_AGENT",
  "MCP_CLIENT",
  "CLI",
  "WEB_APP",
  "BROWSER_EXTENSION",
  "HOSTED_APP",
  "OTHER"
];

export const trustLevels: Client["trustLevel"][] = [
  "UNKNOWN",
  "APPROVED",
  "BLOCKED"
];

export const retentionLevels: Client["declaredRetention"][] = [
  "NO_STORAGE",
  "SESSION",
  "PERSISTENT",
  "UNKNOWN"
];

export const operations: Policy["operations"][number][] = [
  "READ",
  "SUGGEST",
  "WRITE",
  "SUMMARIZE",
  "EXPORT"
];

export const purposeSuggestions = [
  "software_development",
  "personal_assistant",
  "research",
  "scheduling",
  "communication",
  "health"
];

export const emptyClientDraft: ClientDraft = {
  name: "",
  type: "MCP_CLIENT",
  trustLevel: "UNKNOWN",
  declaredRetention: "UNKNOWN"
};

export const emptyPolicyDraft: PolicyDraft = {
  purpose: "software_development",
  allowedCategoryKeys: [],
  deniedCategoryKeys: [],
  maxSensitivity: "INTERNAL",
  operations: ["READ"],
  requiresConfirmation: true,
  expiresAt: ""
};

export function toClientDraft(client: Client): ClientDraft {
  return {
    name: client.name,
    type: client.type,
    trustLevel: client.trustLevel,
    declaredRetention: client.declaredRetention
  };
}

export function toPolicyDraft(policy: Policy): PolicyDraft {
  return {
    purpose: policy.purpose,
    allowedCategoryKeys: policy.allowedCategoryKeys,
    deniedCategoryKeys: policy.deniedCategoryKeys,
    maxSensitivity: policy.maxSensitivity,
    operations: policy.operations,
    requiresConfirmation: policy.requiresConfirmation,
    expiresAt: toDateInputValue(policy.expiresAt)
  };
}

export function getCategoryAccess(
  draft: PolicyDraft,
  key: string
): "allowed" | "denied" {
  if (draft.deniedCategoryKeys.includes(key)) {
    return "denied";
  }

  return draft.allowedCategoryKeys.length === 0 ||
    draft.allowedCategoryKeys.includes(key)
    ? "allowed"
    : "denied";
}
export function updateCategoryAccess(
  draft: PolicyDraft,
  categories: { key: string }[],
  key: string,
  access: "allowed" | "denied"
): PolicyDraft {
  const allowed = (categoryKey: string) =>
    categoryKey === key
      ? access === "allowed"
      : getCategoryAccess(draft, categoryKey) === "allowed";
  const keys = categories.map((category) => category.key);

  return {
    ...draft,
    allowedCategoryKeys: keys.filter(allowed),
    deniedCategoryKeys: keys.filter((key) => !allowed(key))
  };
}
export function togglePolicyOperation(
  draft: PolicyDraft,
  operation: Policy["operations"][number]
): PolicyDraft {
  const operations = draft.operations.includes(operation)
    ? draft.operations.filter((item) => item !== operation)
    : [...draft.operations, operation];

  return {
    ...draft,
    operations: operations.length > 0 ? operations : ["READ"]
  };
}

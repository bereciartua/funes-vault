import type { Client, Policy } from "@funes-vault/shared";
import {
  type PolicyRiskCode,
  policyRiskFactors as sharedPolicyRiskFactors
} from "@funes-vault/shared";

import { BadgeDescriptor } from "../badge-types";
import { formatRelative } from "../dates";
import { pluralize } from "../text";
import { clientTypeLabel, joinWithAnd, label } from "./labels";
export function clientAccessSummary(
  client: Client,
  policy:
    | (Pick<
        Policy,
        "maxSensitivity" | "allowedCategoryKeys" | "requiresConfirmation"
      > & { expiresAt?: string | null })
    | null
) {
  const lastSeen = client.lastUsedAt
    ? `last seen ${formatRelative(client.lastUsedAt)}`
    : "not used yet";
  const access =
    policy?.expiresAt && new Date(policy.expiresAt) <= new Date()
      ? "App permissions expired"
      : policy
        ? `permissions up to ${label(policy.maxSensitivity)}, ${policy.allowedCategoryKeys.length ? pluralize(policy.allowedCategoryKeys.length, "category", "categories") : "all categories"}${policy.requiresConfirmation ? ", confirmation required" : ""}`
        : client.hasPolicy
          ? "App permissions configured"
          : "no app permissions";

  return `${label(client.trustLevel)} · ${clientTypeLabel(
    client.type
  )} · ${lastSeen} · ${access}`;
}
export function policyRiskFactors(policy: Policy, categoryCount: number) {
  return sharedPolicyRiskFactors(
    {
      allowedCategoryCount: policy.allowedCategoryKeys.length,
      maxSensitivity: policy.maxSensitivity,
      operations: policy.operations,
      requiresConfirmation: policy.requiresConfirmation,
      expiresAt: policy.expiresAt
    },
    categoryCount
  ).map((code) => policyRiskCopy[code]);
}
export function policyRiskDescriptor(
  policy: Policy,
  categoryCount: number
): BadgeDescriptor {
  const factors = policyRiskFactors(policy, categoryCount);

  if (factors.some((factor) => factor.tone === "danger")) {
    return {
      icon: "OctagonAlert",
      label: "High-risk permissions",
      tone: "danger"
    };
  }

  if (factors.some((factor) => factor.tone === "risk")) {
    return { icon: "ShieldAlert", label: "Broad permissions", tone: "risk" };
  }

  if (factors.length > 0) {
    return { icon: "TriangleAlert", label: "Needs review", tone: "attention" };
  }

  return { icon: "ShieldCheck", label: "Narrow permissions", tone: "safe" };
}
export function policySummary(policy: Policy, isFirstParty = false) {
  const client = policy.clientName ?? "An unknown client";
  const operations = joinWithAnd(
    policy.operations.map((operation) => label(operation).toLowerCase())
  );
  const categories =
    policy.allowedCategoryKeys.length > 0
      ? `from ${pluralize(policy.allowedCategoryKeys.length, "allowed category", "allowed categories")}`
      : "from every category";
  const denied =
    policy.deniedCategoryKeys.length > 0
      ? ` (${pluralize(policy.deniedCategoryKeys.length, "category is", "categories are")} always denied)`
      : "";
  const confirmation = policy.requiresConfirmation
    ? "Each matching request needs your confirmation."
    : "Matching requests are shared automatically, without asking you first.";
  const expiration = policy.expiresAt
    ? `Permissions expire on ${new Date(policy.expiresAt).toLocaleDateString()}.`
    : "Permissions never expire.";

  const write =
    policy.operations.includes("WRITE") &&
    !policy.requiresConfirmation &&
    !isFirstParty
      ? " Proposals from this app are applied immediately without review when permitted by these limits."
      : "";

  return `${client} can ${operations} memories up to ${label(policy.maxSensitivity)} sensitivity ${categories}${denied}. ${confirmation} ${expiration}${write}`;
}
type PolicyRiskFactor = {
  label: string;
  tone: "danger" | "risk" | "attention";
};
const policyRiskCopy: Record<PolicyRiskCode, PolicyRiskFactor> = {
  SENSITIVE_ALLOWED: { label: "Allows sensitive memories", tone: "risk" },
  RESTRICTED_ALLOWED: { label: "Allows restricted memories", tone: "risk" },
  SECRET_ALLOWED: { label: "Allows secret memories", tone: "danger" },
  ALL_CATEGORIES: { label: "All categories allowed", tone: "risk" },
  MANY_CATEGORIES: { label: "Many categories allowed", tone: "risk" },
  NO_CONFIRMATION: { label: "No confirmation", tone: "risk" },
  NO_EXPIRATION: { label: "No expiration", tone: "attention" },
  WRITE_ALLOWED: { label: "Can write memories", tone: "danger" },
  EXPORT_ALLOWED: { label: "Can export memory", tone: "danger" }
};

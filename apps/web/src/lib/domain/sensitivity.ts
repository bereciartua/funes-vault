import type { Memory } from "@funes-vault/shared";
import { memorySensitivitySchema } from "@funes-vault/shared";

import { BadgeDescriptor } from "../badge-types";
import { label } from "./labels";
const highSensitivityLevels = new Set<Memory["sensitivity"]>([
  "SENSITIVE",
  "RESTRICTED",
  "SECRET"
]);
export function sensitivityDescriptor(
  sensitivity: Memory["sensitivity"]
): BadgeDescriptor {
  const descriptors: Record<Memory["sensitivity"], BadgeDescriptor> = {
    PUBLIC: { icon: "Globe", label: "Public", tone: "safe" },
    LOW: { icon: "Circle", label: "Low", tone: "info" },
    INTERNAL: { icon: "Building2", label: "Internal", tone: "neutral" },
    SENSITIVE: { icon: "ShieldAlert", label: "Sensitive", tone: "attention" },
    RESTRICTED: { icon: "LockKeyhole", label: "Restricted", tone: "risk" },
    SECRET: { icon: "OctagonAlert", label: "Secret", tone: "danger" }
  };

  return descriptors[sensitivity];
}
export function sensitivityMixSummary(
  counts: Array<{ sensitivity: Memory["sensitivity"]; count: number }>
) {
  return (
    counts
      .filter((item) => item.count > 0)
      .map((item) => `${item.count} ${label(item.sensitivity).toLowerCase()}`)
      .join(" · ") || "No active memories"
  );
}
export function sensitivityDescription(
  sensitivity: Memory["sensitivity"]
): string {
  const descriptions: Record<Memory["sensitivity"], string> = {
    PUBLIC: "Safe to share with any approved client.",
    LOW: "Everyday context with little risk if shared.",
    INTERNAL: "For trusted tools only; kept out of broad disclosures.",
    SENSITIVE: "Shared only when a policy allows it and you confirm.",
    RESTRICTED: "Rarely shared; needs a narrow policy and confirmation.",
    SECRET: "Never leaves the vault through normal disclosures."
  };

  return descriptions[sensitivity];
}
export function isHighSensitivity(sensitivity: Memory["sensitivity"]) {
  return highSensitivityLevels.has(sensitivity);
}

export const sensitivities = memorySensitivitySchema.options;

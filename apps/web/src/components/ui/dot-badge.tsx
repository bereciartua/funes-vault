import type { Client, Memory } from "@funes-vault/shared";

import { label } from "../../lib/domain/labels";

type DotBadgeProps =
  | {
      kind: "sensitivity";
      value: Memory["sensitivity"];
      showLabel?: boolean;
    }
  | {
      kind: "trust";
      value: Client["trustLevel"];
      showLabel?: boolean;
    };

export function DotBadge({ kind, value, showLabel = true }: DotBadgeProps) {
  const accessibleLabel = label(value);

  return (
    <span
      className="dot-badge"
      data-kind={kind}
      data-value={value.toLowerCase()}
      role={showLabel ? undefined : "img"}
      aria-label={showLabel ? undefined : accessibleLabel}
    >
      <i aria-hidden="true" />
      {showLabel ? <span>{accessibleLabel}</span> : null}
    </span>
  );
}

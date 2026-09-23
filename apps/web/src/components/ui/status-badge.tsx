"use client";
import type { Memory } from "@funes-vault/shared";
import {
  Activity,
  Archive,
  BadgeCheck,
  Ban,
  Building2,
  Circle,
  CircleCheck,
  CircleHelp,
  CircleX,
  Clock3,
  ClockAlert,
  Database,
  Globe,
  Hourglass,
  Inbox,
  KeyRound,
  LockKeyhole,
  OctagonAlert,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Trash2,
  TriangleAlert,
  Wrench,
  Zap
} from "lucide-react";

import { type BadgeDescriptor } from "../../lib/badge-types";
import { sensitivityDescriptor } from "../../lib/domain/sensitivity";

type StatusBadgeProps = {
  descriptor: BadgeDescriptor;
  className?: string;
};

const iconMap = {
  Activity,
  Archive,
  BadgeCheck,
  Ban,
  Building2,
  Circle,
  CircleCheck,
  CircleHelp,
  CircleX,
  Clock3,
  ClockAlert,
  Database,
  Globe,
  Hourglass,
  Inbox,
  KeyRound,
  LockKeyhole,
  OctagonAlert,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Trash2,
  TriangleAlert,
  Wrench,
  Zap
};

export function StatusBadge({ className, descriptor }: StatusBadgeProps) {
  const Icon = iconMap[descriptor.icon];

  return (
    <span
      className={["status-badge", className].filter(Boolean).join(" ")}
      data-tone={descriptor.tone}
    >
      <Icon aria-hidden="true" size={14} strokeWidth={2.5} />
      <span className="status-badge-label">{descriptor.label}</span>
    </span>
  );
}

export function SensitivityBadge({
  sensitivity
}: {
  sensitivity: Memory["sensitivity"];
}) {
  return <StatusBadge descriptor={sensitivityDescriptor(sensitivity)} />;
}

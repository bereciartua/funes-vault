type BadgeTone =
  "neutral" | "safe" | "info" | "attention" | "risk" | "danger" | "blocked";
export type BadgeDescriptor = {
  icon:
    | "Activity"
    | "Archive"
    | "BadgeCheck"
    | "Ban"
    | "Building2"
    | "Circle"
    | "CircleCheck"
    | "CircleHelp"
    | "CircleX"
    | "Clock3"
    | "ClockAlert"
    | "Database"
    | "Globe"
    | "Hourglass"
    | "Inbox"
    | "KeyRound"
    | "LockKeyhole"
    | "OctagonAlert"
    | "ShieldAlert"
    | "ShieldCheck"
    | "ShieldQuestion"
    | "Trash2"
    | "TriangleAlert"
    | "Wrench"
    | "Zap";
  label: string;
  tone: BadgeTone;
};

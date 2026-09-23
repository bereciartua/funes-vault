import type { MemorySensitivity } from "./enums.js";
export const EMBEDDING_DIMENSIONS = 1536;
export const demoAccountEmail = "demo@funes-vault.local";
export const sensitivityRank = {
  PUBLIC: 0,
  LOW: 1,
  INTERNAL: 2,
  SENSITIVE: 3,
  RESTRICTED: 4,
  SECRET: 5
} satisfies Record<MemorySensitivity, number>;
export function isAtMostSensitivity(
  value: MemorySensitivity,
  maximum: MemorySensitivity
) {
  return sensitivityRank[value] <= sensitivityRank[maximum];
}
export const defaultMemoryCategories = [
  {
    key: "communication_style",
    name: "Communication Style",
    description: "How the user likes assistants to communicate."
  },
  {
    key: "personal_preferences",
    name: "Personal Preferences",
    description: "General personal tastes, likes, dislikes, and preferences."
  },
  {
    key: "software_development",
    name: "Software Development",
    description: "Coding tools, languages, workflows, and preferences."
  },
  {
    key: "project_context",
    name: "Project Context",
    description: "Context tied to active projects."
  },
  {
    key: "privacy_preferences",
    name: "Privacy Preferences",
    description: "User preferences about storage, sharing, and disclosure."
  },
  {
    key: "health",
    name: "Health",
    description: "Health-related memories that should be treated carefully."
  },
  {
    key: "finance",
    name: "Finance",
    description: "Financial memories that should be treated carefully."
  },
  {
    key: "legal",
    name: "Legal",
    description: "Legal memories that should be treated carefully."
  }
] as const;

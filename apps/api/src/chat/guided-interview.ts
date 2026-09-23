import type { MemoryKind, MemorySensitivity } from "@funes-vault/shared";
export type GuidedInterviewQuestion = {
  id: string;
  category: string;
  prompt: string;
  categoryKeys: string[];
  suggestedKind: MemoryKind;
  suggestedSensitivity: MemorySensitivity;
  title: string;
};

export const guidedInterviewQuestions: GuidedInterviewQuestion[] = [
  {
    id: "collaboration_style",
    category: "Collaboration style",
    prompt: "How do you like AI assistants to collaborate with you?",
    categoryKeys: ["communication_style"],
    suggestedKind: "PREFERENCE",
    suggestedSensitivity: "LOW",
    title: "Collaboration preference"
  },
  {
    id: "communication_preferences",
    category: "Communication preferences",
    prompt: "What tone, level of detail, or format do you usually prefer?",
    categoryKeys: ["communication_style"],
    suggestedKind: "PREFERENCE",
    suggestedSensitivity: "LOW",
    title: "Communication preference"
  },
  {
    id: "software_development_preferences",
    category: "Software development preferences",
    prompt:
      "What should future coding assistants know about how you build software?",
    categoryKeys: ["software_development"],
    suggestedKind: "INSTRUCTION",
    suggestedSensitivity: "LOW",
    title: "Software development preference"
  },
  {
    id: "current_projects",
    category: "Current projects",
    prompt:
      "Which current projects should your vault remember, and why do they matter?",
    categoryKeys: ["project_context"],
    suggestedKind: "PROJECT_CONTEXT",
    suggestedSensitivity: "INTERNAL",
    title: "Current project context"
  },
  {
    id: "privacy_preferences",
    category: "Privacy preferences",
    prompt:
      "What should Funes Vault be especially careful not to share casually?",
    categoryKeys: ["privacy_preferences"],
    suggestedKind: "CONSTRAINT",
    suggestedSensitivity: "INTERNAL",
    title: "Privacy boundary"
  },
  {
    id: "life_constraints",
    category: "Life constraints",
    prompt:
      "Are there practical constraints that often shape your work or availability?",
    categoryKeys: ["project_context"],
    suggestedKind: "CONSTRAINT",
    suggestedSensitivity: "INTERNAL",
    title: "Practical constraint"
  },
  {
    id: "long_term_goals",
    category: "Long-term goals",
    prompt:
      "What long-term goals should assistants keep in mind when helping you?",
    categoryKeys: ["project_context"],
    suggestedKind: "GOAL",
    suggestedSensitivity: "INTERNAL",
    title: "Long-term goal"
  }
];

export function interviewGuidanceText() {
  return guidedInterviewQuestions
    .map((question) => `- ${question.category}: ${question.prompt}`)
    .join("\n");
}

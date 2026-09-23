// Synthetic sources only. These fixtures are also used by the optional live smoke command.
export const memoryFixtures = [
  { id: "preference", text: "I prefer concise answers.", expected: "eligible" },
  {
    id: "several",
    text: "Remember that I prefer cats over dogs. I use pnpm for JavaScript projects.",
    expected: "multiple"
  },
  {
    id: "remember",
    text: "Please remember that I use pnpm.",
    expected: "eligible"
  },
  { id: "acknowledgment", text: "Thanks, awesome!", expected: "noop" },
  {
    id: "hypothetical",
    text: "If I preferred cats, what would that imply?",
    expected: "noop"
  },
  {
    id: "quotation",
    text: 'The example says "I prefer cats".',
    expected: "noop"
  },
  { id: "third_person", text: "My colleague prefers cats.", expected: "noop" },
  {
    id: "confirmation",
    text: "Yes, remember that preference.",
    expected: "clarification_without_context"
  },
  {
    id: "correction",
    text: "I used to use npm, now I use pnpm.",
    expected: "reconciliation"
  },
  {
    id: "retraction",
    text: "Forget my old preference for coffee.",
    expected: "reconciliation"
  },
  {
    id: "scope",
    text: "I use npm at work and pnpm for personal projects.",
    expected: "scoped"
  },
  {
    id: "temporary",
    text: "Remember I am on vacation until October 3, 2026 in New York.",
    expected: "expiration"
  },
  {
    id: "ambiguous_date",
    text: "Remember my deadline is next Friday, or maybe the one after.",
    expected: "clarification"
  },
  {
    id: "negation",
    text: "Remember I do not drink coffee.",
    expected: "eligible"
  },
  {
    id: "secret",
    text: "Remember api_key=synthetic_secret_1234567890",
    expected: "blocked"
  },
  {
    id: "spanish",
    text: "Recuerda que prefiero respuestas breves.",
    expected: "eligible"
  }
] as const;

/** Keep the persisted provider identifiers stable while explaining them in the UI. */
export function processorLabel(processor: string) {
  return processor === "typesafe"
    ? "TypeSafe Jev (memory classifier)"
    : processor === "openai"
      ? "OpenAI"
      : processor;
}

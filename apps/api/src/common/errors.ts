/** Extract diagnostic text without assuming a thrown value is an Error. */
export function errorMessage(
  error: unknown,
  fallback = "Unknown error"
): string {
  return error instanceof Error ? error.message : fallback;
}

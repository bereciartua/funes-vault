/** Report bootstrap failures consistently before the structured logger is available. */
export function bootstrapFailure(processName: string, error: unknown): never {
  console.error(
    `${processName} bootstrap failed:`,
    error instanceof Error ? (error.stack ?? error.message) : error
  );
  process.exit(1);
}

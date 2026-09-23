export const vaultSearchDebounceMs = 300;

export function scheduleDebouncedUpdate<T>(
  value: T,
  onUpdate: (value: T) => void,
  delayMs: number
) {
  const timeout = globalThis.setTimeout(() => onUpdate(value), delayMs);

  return () => globalThis.clearTimeout(timeout);
}

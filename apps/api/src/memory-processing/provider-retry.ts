import type { ProcessingContext } from "./contracts.js";
export async function withProviderRetry<T>(
  context: Pick<ProcessingContext, "signal" | "deadline" | "beforeCall">,
  payload: unknown,
  call: () => Promise<T>
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    context.signal.throwIfAborted();
    await context.beforeCall(payload);
    try {
      return await call();
    } catch (error) {
      const retryable =
        (error as { isRetryable?: boolean }).isRetryable === true;
      if (attempt || !retryable || Date.now() >= context.deadline) {
        throw error;
      }
    }
  }
}

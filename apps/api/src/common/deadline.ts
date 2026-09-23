/** Bound infrastructure waits without leaving a timer alive after success. */
export async function withDeadline<T>(
  work: Promise<T>,
  milliseconds: number
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Infrastructure operation timed out")),
          milliseconds
        );
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

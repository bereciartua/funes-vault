/** Wait for source persistence/extraction, including tools that beat transcription. */
export function createVoiceSourceBarrier() {
  const sources = new Map<
    string,
    { ready: Promise<void>; finish: () => void }
  >();

  return {
    start(itemId: string) {
      if (!sources.has(itemId)) {
        let finish!: () => void;
        const ready = new Promise<void>((resolve) => {
          finish = resolve;
        });
        sources.set(itemId, { ready, finish });
      }
    },
    finish(itemId: string) {
      sources.get(itemId)?.finish();
    },
    async wait(itemId: string) {
      const source = sources.get(itemId);
      if (!source) {
        return;
      }
      // A lost transcription/network response must not hang the voice tool forever.
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          source.ready,
          new Promise<void>((resolve) => {
            timeout = setTimeout(resolve, 30_000);
          })
        ]);
      } finally {
        clearTimeout(timeout);
      }
    },
    reset() {
      for (const source of sources.values()) {
        source.finish();
      }
      sources.clear();
    }
  };
}

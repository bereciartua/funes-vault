import { withDeadline } from "./deadline.js";

// The executable selects its role before Nest instantiates any queue services.
let standaloneWorker = false;
export function selectWorkerProcess() {
  standaloneWorker = true;
}

/** HTTP starts immediately, including development's embedded workers; the worker executable must be ready. */
export async function initializeWorker(
  readiness: Promise<unknown>,
  onBackgroundError: () => void
) {
  if (standaloneWorker) {
    await withDeadline(readiness, 10000);
  } else {
    void readiness.catch(onBackgroundError);
  }
}

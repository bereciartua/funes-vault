/** The last verified owner selects a device queue; it never authenticates API access. */
export function readOfflineOwner(apiUrl: string): string | null {
  try {
    return localStorage.getItem(`funes-offline-owner:${apiUrl}`) || null;
  } catch {
    return null;
  }
}

export function rememberOfflineOwner(apiUrl: string, ownerId: string | null) {
  try {
    const key = `funes-offline-owner:${apiUrl}`;
    if (ownerId) {
      localStorage.setItem(key, ownerId);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // Storage may be unavailable; the live session can still use its queue.
  }
}

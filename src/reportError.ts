export function reportError(error: unknown): void {
  if (typeof window.reportError === "function") {
    window.reportError(error);
    return;
  }

  window.setTimeout(() => {
    throw error;
  }, 0);
}

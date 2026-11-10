/**
 * Invokes `callback` once per hide cycle when the page is hidden, paged out, or about to
 * unload, and returns a cleanup function. The guard resets on `pageshow` or when the page
 * becomes visible again. A no-op outside a browser.
 */
export function createVisibilityChangeListener(callback: () => Promise<void> | void): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => undefined;
  }

  let handled = false;

  const handleHide = (): void => {
    if (handled) return;
    handled = true;
    try {
      void Promise.resolve(callback()).catch(() => undefined);
    } catch {
      // A failing flush must not break page teardown.
    }
  };
  const resetHandled = (): void => {
    handled = false;
  };
  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') handleHide();
    else resetHandled();
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', handleHide);
  window.addEventListener('beforeunload', handleHide);
  window.addEventListener('pageshow', resetHandled);

  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', handleHide);
    window.removeEventListener('beforeunload', handleHide);
    window.removeEventListener('pageshow', resetHandled);
  };
}

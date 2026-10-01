export type Timer = ReturnType<typeof setTimeout>;
export type Interval = ReturnType<typeof setInterval>;

/** Whether DOM listeners can be attached — false on the server. */
export const CAN_ADD_LISTENERS =
  typeof window !== 'undefined' &&
  typeof document !== 'undefined' &&
  typeof document.addEventListener === 'function';

export const HAS_MUTATION_OBSERVER = CAN_ADD_LISTENERS && typeof MutationObserver !== 'undefined';

/**
 * Observed-element reference. Held weakly where `WeakRef` exists so a removed
 * element can be collected before the orphan sweep notices it; `strongRef` is
 * the fallback for runtimes without `WeakRef`.
 */
export interface WeakRefState {
  ref: WeakRef<Element> | null;
  strongRef: Element | null;
}

export interface FireTimerState {
  fireTimer: Timer | null;
}

export const NOW = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

export const isPageVisible = (): boolean =>
  !CAN_ADD_LISTENERS ? true : document.visibilityState === 'visible';

/**
 * Calls `handler` with the page's visibility on every change, treating
 * `pagehide`/`beforeunload` as hidden and `pageshow` (bfcache restore) as
 * visible. Returns a cleanup function, or `undefined` on the server.
 */
export const addVisibilityChangeListener = (
  handler: (isVisible: boolean) => void
): (() => void) | undefined => {
  if (!CAN_ADD_LISTENERS) return undefined;

  const onVisibilityChange = (): void => handler(isPageVisible());
  const onPageHide = (): void => handler(false);
  const onBeforeUnload = (): void => handler(false);
  const onPageShow = (): void => handler(true);

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('beforeunload', onBeforeUnload);
  window.addEventListener('pageshow', onPageShow);

  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('beforeunload', onBeforeUnload);
    window.removeEventListener('pageshow', onPageShow);
  };
};

export const clearFireTimer = (state: FireTimerState): void => {
  if (state.fireTimer !== null) {
    clearTimeout(state.fireTimer);
    state.fireTimer = null;
  }
};

export const createElementRef = (element: Element): WeakRefState => {
  const hasWeakRef = typeof WeakRef === 'function';
  return {
    ref: hasWeakRef ? new WeakRef(element) : null,
    strongRef: hasWeakRef ? null : element,
  };
};

export const derefElement = (state: WeakRefState): Element | null => {
  if (state.ref && typeof state.ref.deref === 'function') {
    const element = state.ref.deref();
    if (element) return element;
  }
  return state.strongRef ?? null;
};

/**
 * Awaits `invoke`, routing a throw or rejection to `onError` instead of
 * propagating it — one failing callback must not break its callback chain.
 */
export async function safeCallAsync(
  invoke: () => unknown,
  onError: (error: unknown) => void
): Promise<void> {
  try {
    await invoke();
  } catch (error) {
    try {
      onError(error);
    } catch {
      // A failing error handler must not break the chain either.
    }
  }
}

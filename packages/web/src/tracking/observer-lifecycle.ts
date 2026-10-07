import { derefElement, type Interval, type WeakRefState } from './observer-support.js';

interface ObserverLifecycleState extends WeakRefState {
  done: boolean;
}

interface ObserverStateCollection<TState extends ObserverLifecycleState> {
  activeStates: Set<TState>;
  states: WeakMap<Element, TState>;
}

export const ensureSweeper = (
  current: Interval | null,
  sweep: () => void,
  intervalMs: number
): Interval => {
  if (current !== null) return current;
  return setInterval(sweep, intervalMs);
};

export const stopSweeper = (current: Interval | null): Interval | null => {
  if (current === null) return current;
  clearInterval(current);
  return null;
};

export const finalizeDroppedState = <TState extends ObserverLifecycleState>(
  state: TState,
  { activeStates, states }: ObserverStateCollection<TState>
): void => {
  state.done = true;
  activeStates.delete(state);

  if (state.strongRef) {
    states.delete(state.strongRef);
    state.strongRef = null;
  }
};

export const safeAutoUnobserve = <TState extends ObserverLifecycleState>(
  element: Element,
  state: TState,
  { activeStates, states }: ObserverStateCollection<TState>,
  unobserve: (target: Element) => void
): void => {
  try {
    unobserve(element);
  } catch {
    activeStates.delete(state);
    if (state.strongRef === element) {
      states.delete(element);
      state.strongRef = null;
    }
    state.done = true;
  }
};

export const sweepOrphans = <TState extends ObserverLifecycleState>(
  { activeStates, states }: ObserverStateCollection<TState>,
  unobserve: (target: Element) => void
): void => {
  for (const state of activeStates) {
    const element = derefElement(state);

    if (!element) {
      finalizeDroppedState(state, { activeStates, states });
      continue;
    }

    if (!element.isConnected) {
      safeAutoUnobserve(element, state, { activeStates, states }, unobserve);
    }
  }
};

/**
 * Runs `invoke` after whatever `state` has already queued, so one session's
 * callbacks are delivered in order, and tracks it in `pendingCallbacks` until
 * it settles so `endActive` can await it.
 */
export const chainCallback = (
  state: { callbackChain: Promise<void> | null },
  invoke: () => Promise<void>,
  pendingCallbacks: Set<Promise<void>>
): Promise<void> => {
  const pending = state.callbackChain ? state.callbackChain.then(invoke) : invoke();

  state.callbackChain = pending;
  pendingCallbacks.add(pending);
  void pending.then(() => {
    if (state.callbackChain === pending) state.callbackChain = null;
    pendingCallbacks.delete(pending);
  });

  return pending;
};

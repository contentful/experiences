/*
 * Behavior:
 * - Fires one start callback (`attempts: 1`) once an element has been
 *   continuously hovered for `DEFAULTS.DWELL_MS`.
 * - Emits one final callback (`attempts: 2`, same `hoverId`) with the total
 *   hover duration when that qualified hover ends.
 * - Ends hovers when the page is hidden; a fresh pointer entry is needed after.
 * - Ignores touch pointers — touch has no hover.
 * - Serializes the start and final callbacks per element.
 * - Sweeps orphan/disconnected element state to avoid leaks.
 */

import {
  ensureSweeper,
  finalizeDroppedState,
  stopSweeper,
  sweepOrphans,
} from '../observer-lifecycle.js';
import {
  addVisibilityChangeListener,
  CAN_ADD_LISTENERS,
  clearFireTimer,
  createElementRef,
  derefElement,
  type Interval,
  isPageVisible,
  NOW,
  safeCallAsync,
  type Timer,
} from '../observer-support.js';

export const DEFAULTS = {
  DWELL_MS: 1000,
  SWEEP_INTERVAL_MS: 30000,
} as const;

export interface ElementHoverCallbackInfo {
  /** Hover time accumulated in this hover, in milliseconds. */
  readonly totalHoverMs: number;
  /** Stable for every callback of one hover. */
  readonly hoverId: string;
  /** `1` when the hover first qualifies (dwell reached), `2` when it ends. */
  readonly attempts: number;
  readonly data?: unknown;
}

export type ElementHoverCallback = (
  element: Element,
  info: ElementHoverCallbackInfo
) => void | Promise<void>;

export interface ElementHoverElementOptions {
  readonly data?: unknown;
}

interface ElementState {
  ref: WeakRef<Element> | null;
  strongRef: Element | null;
  data?: unknown;
  accumulatedMs: number;
  hoverSince: number | null;
  fireTimer: Timer | null;
  attempts: number;
  hoverId: string | null;
  done: boolean;
  isHovered: boolean;
  callbackChain: Promise<void> | null;
  enterHandler: (event: Event) => void;
  leaveHandler: (event: Event) => void;
}

const createHoverId = (): string => crypto.randomUUID();

const canUsePointerEvents = (): boolean =>
  CAN_ADD_LISTENERS &&
  typeof PointerEvent !== 'undefined' &&
  typeof window.PointerEvent === 'function';

const isNaturalHoverEvent = (event: Event): boolean =>
  typeof PointerEvent !== 'undefined' && event instanceof PointerEvent
    ? event.pointerType !== 'touch'
    : true;

export class ElementHoverObserver {
  private readonly states = new WeakMap<Element, ElementState>();
  private readonly activeStates = new Set<ElementState>();
  private readonly pendingCallbacks = new Set<Promise<void>>();
  private cleanupVisibilityListener?: () => void;
  private sweepInterval: Interval | null = null;

  constructor(private readonly callback: ElementHoverCallback) {
    this.cleanupVisibilityListener = addVisibilityChangeListener((isVisible) =>
      this.onPageVisibilityChange(isVisible)
    );
  }

  observe(element: Element, options?: ElementHoverElementOptions): void {
    const state = this.states.get(element);

    if (!state) {
      const nextState = this.createState(element, options);
      this.states.set(element, nextState);
      this.activeStates.add(nextState);
      ElementHoverObserver.attachHoverListeners(element, nextState);
      this.ensureSweeper();
      return;
    }

    state.data = options?.data;
  }

  /** Stops observing `element` without emitting a final callback — see `endActive`. */
  unobserve(element: Element): void {
    const state = this.states.get(element);
    if (!state) return;

    ElementHoverObserver.detachHoverListeners(element, state);
    clearFireTimer(state);
    state.done = true;
    this.activeStates.delete(state);

    if (state.strongRef === element) state.strongRef = null;

    this.states.delete(element);
    this.maybeStopSweeper();
  }

  disconnect(): void {
    for (const state of this.activeStates) {
      const element = derefElement(state);
      if (element) ElementHoverObserver.detachHoverListeners(element, state);

      clearFireTimer(state);
      state.done = true;
      state.strongRef = null;
    }

    this.activeStates.clear();

    this.cleanupVisibilityListener?.();
    this.cleanupVisibilityListener = undefined;

    this.stopSweeper();
  }

  /** Ends every active hover, emitting final callbacks for qualified ones, and awaits them. */
  async endActive(): Promise<void> {
    const now = NOW();

    for (const state of this.activeStates) {
      this.endHoverCycle(state, now);
    }

    await Promise.all(this.pendingCallbacks);
  }

  private createState(element: Element, options?: ElementHoverElementOptions): ElementState {
    const state: ElementState = {
      ...createElementRef(element),
      data: options?.data,
      accumulatedMs: 0,
      hoverSince: null,
      fireTimer: null,
      attempts: 0,
      hoverId: null,
      done: false,
      isHovered: false,
      callbackChain: null,
      enterHandler: () => undefined,
      leaveHandler: () => undefined,
    };

    state.enterHandler = (event) => this.onHoverStart(state, event);
    state.leaveHandler = (event) => this.onHoverEnd(state, event);

    return state;
  }

  private static attachHoverListeners(element: Element, state: ElementState): void {
    if (canUsePointerEvents()) {
      element.addEventListener('pointerenter', state.enterHandler);
      element.addEventListener('pointerleave', state.leaveHandler);
      element.addEventListener('pointercancel', state.leaveHandler);
      return;
    }

    element.addEventListener('mouseenter', state.enterHandler);
    element.addEventListener('mouseleave', state.leaveHandler);
  }

  private static detachHoverListeners(element: Element, state: ElementState): void {
    if (canUsePointerEvents()) {
      element.removeEventListener('pointerenter', state.enterHandler);
      element.removeEventListener('pointerleave', state.leaveHandler);
      element.removeEventListener('pointercancel', state.leaveHandler);
      return;
    }

    element.removeEventListener('mouseenter', state.enterHandler);
    element.removeEventListener('mouseleave', state.leaveHandler);
  }

  private onHoverStart(state: ElementState, event: Event): void {
    if (state.done || state.isHovered || !isNaturalHoverEvent(event) || !isPageVisible()) {
      return;
    }

    state.isHovered = true;
    state.accumulatedMs = 0;
    state.attempts = 0;
    state.hoverId = createHoverId();
    state.hoverSince = NOW();
    clearFireTimer(state);
    this.scheduleQualification(state);
  }

  private onHoverEnd(state: ElementState, event: Event): void {
    if (state.done || !state.isHovered || !isNaturalHoverEvent(event)) return;

    this.endHoverCycle(state, NOW());
  }

  private onPageVisibilityChange(isVisible: boolean): void {
    if (!isVisible) {
      const now = NOW();
      for (const state of this.activeStates) {
        this.endHoverCycle(state, now);
      }
    }

    this.sweepOrphans();
  }

  private static resetHoverCycle(state: ElementState): void {
    state.isHovered = false;
    state.accumulatedMs = 0;
    state.hoverSince = null;
    state.attempts = 0;
    state.hoverId = null;
    clearFireTimer(state);
  }

  private scheduleQualification(state: ElementState): void {
    if (
      state.done ||
      state.fireTimer !== null ||
      !state.isHovered ||
      !isPageVisible() ||
      state.hoverId === null
    ) {
      return;
    }

    state.fireTimer = setTimeout(() => {
      if (
        state.done ||
        !state.isHovered ||
        !isPageVisible() ||
        state.hoverSince === null ||
        state.hoverId === null
      ) {
        clearFireTimer(state);
        return;
      }

      this.qualify(state, NOW());
    }, DEFAULTS.DWELL_MS);
  }

  private qualify(state: ElementState, now: number): void {
    if (state.done || !state.isHovered || state.hoverId === null || state.hoverSince === null) {
      return;
    }

    clearFireTimer(state);
    state.attempts = 1;
    state.accumulatedMs = Math.max(0, now - state.hoverSince);
    void this.queueCallback(state, state.hoverId, state.accumulatedMs, state.attempts);
  }

  private endHoverCycle(state: ElementState, now: number): void {
    if (state.done || !state.isHovered || state.hoverId === null) return;

    if (state.hoverSince !== null) {
      state.accumulatedMs = Math.max(state.accumulatedMs, now - state.hoverSince);
    }

    const { hoverId, accumulatedMs: totalHoverMs } = state;
    const qualified = state.attempts > 0;

    ElementHoverObserver.resetHoverCycle(state);

    if (qualified) {
      void this.queueCallback(state, hoverId, totalHoverMs, 2);
    }
  }

  private async queueCallback(
    state: ElementState,
    hoverId: string,
    totalHoverMs: number,
    attempts: number
  ): Promise<void> {
    const element = derefElement(state);
    if (!element) {
      this.finalizeDroppedState(state);
      return;
    }

    const { data } = state;
    const invoke = (): Promise<void> =>
      safeCallAsync(
        () => this.callback(element, { totalHoverMs, hoverId, attempts, data }),
        (error) => {
          console.error('[@contentful/experiences] Error in element hover callback:', error);
        }
      );
    const pending = state.callbackChain ? state.callbackChain.then(invoke) : invoke();

    state.callbackChain = pending;
    this.pendingCallbacks.add(pending);
    void pending.then(() => {
      if (state.callbackChain === pending) state.callbackChain = null;
      this.pendingCallbacks.delete(pending);
    });

    await pending;
  }

  private finalizeDroppedState(state: ElementState): void {
    finalizeDroppedState(state, { activeStates: this.activeStates, states: this.states });
    this.maybeStopSweeper();
  }

  private ensureSweeper(): void {
    this.sweepInterval = ensureSweeper(
      this.sweepInterval,
      () => this.sweepOrphans(),
      DEFAULTS.SWEEP_INTERVAL_MS
    );
  }

  private stopSweeper(): void {
    this.sweepInterval = stopSweeper(this.sweepInterval);
  }

  private maybeStopSweeper(): void {
    if (this.activeStates.size === 0) this.stopSweeper();
  }

  private sweepOrphans(): void {
    sweepOrphans({ activeStates: this.activeStates, states: this.states }, (target) =>
      this.unobserve(target)
    );
    this.maybeStopSweeper();
  }
}

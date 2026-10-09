/*
 * Behavior:
 * - Fires one start callback (`attempts: 1`) once an element has been
 *   continuously hovered for `DEFAULTS.DWELL_MS`.
 * - Emits one final callback (`attempts: 2`, same `hoverId`) with the total
 *   hover duration when that qualified hover ends.
 * - Ends hovers when the page is hidden; a fresh pointer entry is needed after.
 * - Ignores touch pointers — touch has no hover.
 * - Serializes the start and final callbacks.
 * - Treats every observed element as a member of ONE hover: it runs while any
 *   member is hovered and ends when the last one is left, under one hoverId.
 * - Sweeps orphan/disconnected element state to avoid leaks.
 */

import { chainCallback, ensureSweeper, stopSweeper, sweepOrphans } from '../observer-lifecycle.js';
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
  type WeakRefState,
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
}

export type ElementHoverCallback = (info: ElementHoverCallbackInfo) => void | Promise<void>;

interface ElementState extends WeakRefState {
  done: boolean;
  isHovered: boolean;
  enterHandler: (event: Event) => void;
  leaveHandler: (event: Event) => void;
}

/** The hover all observed elements are members of. */
interface HoverSession {
  accumulatedMs: number;
  attempts: number;
  callbackChain: Promise<void> | null;
  done: boolean;
  fireTimer: Timer | null;
  hoverId: string | null;
  hoverSince: number | null;
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
  private readonly session: HoverSession = {
    accumulatedMs: 0,
    attempts: 0,
    callbackChain: null,
    done: false,
    fireTimer: null,
    hoverId: null,
    hoverSince: null,
  };
  private cleanupVisibilityListener?: () => void;
  private sweepInterval: Interval | null = null;

  constructor(private readonly callback: ElementHoverCallback) {
    this.cleanupVisibilityListener = addVisibilityChangeListener((isVisible) =>
      this.onPageVisibilityChange(isVisible)
    );
  }

  observe(element: Element): void {
    if (this.states.has(element)) return;

    const state = this.createState(element);
    this.states.set(element, state);
    this.activeStates.add(state);
    ElementHoverObserver.attachHoverListeners(element, state);
    this.ensureSweeper();
  }

  /** Stops observing `element` without emitting a final callback — see `endActive`. */
  unobserve(element: Element): void {
    const state = this.states.get(element);
    if (!state) return;

    ElementHoverObserver.detachHoverListeners(element, state);
    state.done = true;
    this.activeStates.delete(state);

    if (state.strongRef === element) state.strongRef = null;

    this.states.delete(element);
    this.releaseMember(state);
    this.maybeStopSweeper();
  }

  disconnect(): void {
    for (const state of this.activeStates) {
      const element = derefElement(state);
      if (element) ElementHoverObserver.detachHoverListeners(element, state);

      state.done = true;
      state.strongRef = null;
    }

    this.activeStates.clear();

    clearFireTimer(this.session);
    this.session.done = true;

    this.cleanupVisibilityListener?.();
    this.cleanupVisibilityListener = undefined;

    this.stopSweeper();
  }

  /** Ends the active hover, emitting a final callback if it qualified, and awaits it. */
  async endActive(): Promise<void> {
    this.endHoverCycle(NOW());
    for (const state of this.activeStates) state.isHovered = false;

    await Promise.all(this.pendingCallbacks);
  }

  private createState(element: Element): ElementState {
    const state: ElementState = {
      ...createElementRef(element),
      done: false,
      isHovered: false,
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
    const { session } = this;
    // A second member entered while the hover is already running.
    if (session.hoverId !== null) return;

    session.accumulatedMs = 0;
    session.attempts = 0;
    session.hoverId = createHoverId();
    session.hoverSince = NOW();
    clearFireTimer(session);
    this.scheduleQualification();
  }

  private onHoverEnd(state: ElementState, event: Event): void {
    if (state.done || !state.isHovered || !isNaturalHoverEvent(event)) return;

    state.isHovered = false;
    // The hover runs until the last hovered member is left.
    if (this.hasHoveredMember()) return;

    this.endHoverCycle(NOW());
  }

  private hasHoveredMember(): boolean {
    for (const member of this.activeStates) {
      if (!member.done && member.isHovered) return true;
    }
    return false;
  }

  /**
   * Brings the hover in line after a member left. No members left drops it
   * silently; losing the last hovered member ends it normally.
   */
  private releaseMember(state: ElementState): void {
    const wasHovered = state.isHovered;
    state.isHovered = false;

    if (this.activeStates.size === 0) {
      this.resetHoverCycle();
    } else if (wasHovered && !this.hasHoveredMember()) {
      this.endHoverCycle(NOW());
    }
  }

  private onPageVisibilityChange(isVisible: boolean): void {
    if (!isVisible) {
      this.endHoverCycle(NOW());
      for (const state of this.activeStates) state.isHovered = false;
    }

    this.sweepOrphans();
  }

  private resetHoverCycle(): void {
    const { session } = this;
    session.accumulatedMs = 0;
    session.hoverSince = null;
    session.attempts = 0;
    session.hoverId = null;
    clearFireTimer(session);
  }

  private scheduleQualification(): void {
    const { session } = this;
    if (
      session.done ||
      session.fireTimer !== null ||
      !isPageVisible() ||
      session.hoverId === null
    ) {
      return;
    }

    session.fireTimer = setTimeout(() => {
      if (
        session.done ||
        !isPageVisible() ||
        session.hoverSince === null ||
        session.hoverId === null
      ) {
        clearFireTimer(session);
        return;
      }

      this.qualify(NOW());
    }, DEFAULTS.DWELL_MS);
  }

  private qualify(now: number): void {
    const { session } = this;
    if (session.done || session.hoverId === null || session.hoverSince === null) {
      return;
    }

    clearFireTimer(session);
    session.attempts = 1;
    session.accumulatedMs = Math.max(0, now - session.hoverSince);
    void this.queueCallback(session.hoverId, session.accumulatedMs, session.attempts);
  }

  private endHoverCycle(now: number): void {
    const { session } = this;
    if (session.done || session.hoverId === null) return;

    if (session.hoverSince !== null) {
      session.accumulatedMs = Math.max(session.accumulatedMs, now - session.hoverSince);
    }

    const { hoverId, accumulatedMs: totalHoverMs } = session;
    const qualified = session.attempts > 0;

    this.resetHoverCycle();

    if (qualified) {
      void this.queueCallback(hoverId, totalHoverMs, 2);
    }
  }

  private async queueCallback(
    hoverId: string,
    totalHoverMs: number,
    attempts: number
  ): Promise<void> {
    if (this.activeStates.size === 0) return;

    const invoke = (): Promise<void> =>
      safeCallAsync(
        () => this.callback({ totalHoverMs, hoverId, attempts }),
        (error) => {
          console.error('[@contentful/experiences] Error in element hover callback:', error);
        }
      );
    await chainCallback(this.session, invoke, this.pendingCallbacks);
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

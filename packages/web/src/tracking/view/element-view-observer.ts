/*
 * Behavior:
 * - Fires one start callback (`attempts: 1`) once an element has been
 *   continuously any part visible for `DEFAULTS.DWELL_MS`.
 * - Emits one final callback (`attempts: 2`, same `viewId`) with the total
 *   visible duration when that qualified view ends.
 * - Ends view sessions when the page is hidden and starts a fresh session on
 *   return, for elements still in view.
 * - Serializes the start and final callbacks.
 * - Treats every observed element as a member of ONE session: it is in view
 *   while any member is, and start/final callbacks (one viewId) are serialized
 *   across the whole group.
 * - Sweeps orphan/disconnected element state to avoid leaks.
 */

import {
  chainCallback,
  ensureSweeper,
  finalizeDroppedState,
  stopSweeper,
  sweepOrphans,
} from '../observer-lifecycle.js';
import {
  addVisibilityChangeListener,
  clearFireTimer,
  type Interval,
  isPageVisible,
  NOW,
  safeCallAsync,
  type Timer,
} from '../observer-support.js';

import {
  createElementState,
  DEFAULTS,
  type EffectiveObserverOptions,
  type ElementState,
  type ElementViewCallback,
  type ElementViewObserverOptions,
  initElementViewObserverOptions,
} from './element-view-observer-support.js';
import { ElementViewSourceController } from './element-view-source-controller.js';

const createViewId = (): string => crypto.randomUUID();

/** The view all observed elements are members of. */
interface ViewSession {
  accumulatedMs: number;
  attempts: number;
  callbackChain: Promise<void> | null;
  done: boolean;
  fireTimer: Timer | null;
  viewId: string | null;
  visibleSince: number | null;
}

export class ElementViewObserver {
  private readonly opts: EffectiveObserverOptions;
  private readonly io: IntersectionObserver;
  private readonly sourceController: ElementViewSourceController;
  private readonly states = new WeakMap<Element, ElementState>();
  private readonly activeStates = new Set<ElementState>();
  private readonly pendingCallbacks = new Set<Promise<void>>();
  private cleanupVisibilityListener?: () => void;
  private sweepInterval: Interval | null = null;
  private readonly session: ViewSession = {
    accumulatedMs: 0,
    attempts: 0,
    callbackChain: null,
    done: false,
    fireTimer: null,
    viewId: null,
    visibleSince: null,
  };

  constructor(
    private readonly callback: ElementViewCallback,
    options?: ElementViewObserverOptions
  ) {
    this.opts = initElementViewObserverOptions(options);
    this.io = new IntersectionObserver((entries) => this.onIntersect(entries), {
      root: this.opts.root ?? null,
      rootMargin: this.opts.rootMargin,
      threshold: 0,
    });
    this.sourceController = new ElementViewSourceController(this.io, this.opts, {
      onDropped: (state) => this.finalizeDroppedState(state),
      onHidden: (state, now) => this.onVisibilityEnd(state, now),
      onVisible: (state, now) => this.onIntersecting(state, now),
      sweep: () => this.sweepOrphans(),
    });

    this.cleanupVisibilityListener = addVisibilityChangeListener((isVisible) =>
      this.onPageVisibilityChange(isVisible)
    );
  }

  observe(element: Element): void {
    let state = this.states.get(element);

    if (!state) {
      state = createElementState(element);
      this.states.set(element, state);
      this.activeStates.add(state);
      this.ensureSweeper();
    }

    this.sourceController.apply(state, false);
  }

  /** Stops observing `element` without emitting a final callback — see `endActive`. */
  unobserve(element: Element): void {
    const state = this.states.get(element);
    if (!state) {
      this.io.unobserve(element);
      return;
    }

    this.sourceController.remove(state);
    state.done = true;
    this.activeStates.delete(state);

    if (state.strongRef === element) state.strongRef = null;

    this.states.delete(element);
    this.releaseMember(state);
    this.maybeStopSweeper();
  }

  disconnect(): void {
    this.io.disconnect();
    this.sourceController.disconnect();

    for (const state of this.activeStates) {
      state.done = true;
      state.strongRef = null;
      state.target = null;
    }

    this.activeStates.clear();

    clearFireTimer(this.session);
    this.session.done = true;

    this.cleanupVisibilityListener?.();
    this.cleanupVisibilityListener = undefined;

    this.stopSweeper();
  }

  /** Ends the active view session, emitting a final callback if it qualified, and awaits it. */
  async endActive(): Promise<void> {
    this.endVisibilitySession(NOW());

    await Promise.all(this.pendingCallbacks);
  }

  private onPageVisibilityChange(isVisible: boolean): void {
    const now = NOW();

    if (isVisible) {
      this.startVisibilitySession(now);
    } else {
      this.endVisibilitySession(now);
    }

    if (isVisible) this.sourceController.requestVirtualMeasurement();

    this.sweepOrphans();
  }

  private onIntersect(entries: readonly IntersectionObserverEntry[]): void {
    const now = NOW();

    for (const entry of entries) {
      const states = this.sourceController.getStatesForTarget(entry.target);
      if (!states) continue;

      for (const state of states) {
        if (state.done) continue;

        if (entry.isIntersecting) {
          this.onIntersecting(state, now);
        } else {
          this.onVisibilityEnd(state, now);
        }
      }
    }

    this.sweepOrphans();
  }

  private onIntersecting(state: ElementState, now: number): void {
    state.lastKnownVisible = true;
    this.startVisibilitySession(now);
  }

  private onVisibilityEnd(state: ElementState, now: number): void {
    if (!state.lastKnownVisible) return;

    state.lastKnownVisible = false;
    // The session stays in view while any other member is.
    if (this.hasVisibleMember()) return;

    this.endVisibilitySession(now);
  }

  private hasVisibleMember(): boolean {
    for (const member of this.activeStates) {
      if (!member.done && member.lastKnownVisible) return true;
    }
    return false;
  }

  /**
   * Brings the session in line after a member left. No members left drops the
   * session silently; losing the last visible member ends it normally.
   */
  private releaseMember(state: ElementState): void {
    const wasVisible = state.lastKnownVisible;
    state.lastKnownVisible = false;

    if (this.activeStates.size === 0) {
      this.resetVisibilitySession();
    } else if (wasVisible && !this.hasVisibleMember()) {
      this.endVisibilitySession(NOW());
    }
  }

  private startVisibilitySession(now: number): void {
    const { session } = this;
    if (session.done || !this.hasVisibleMember() || !isPageVisible() || session.viewId !== null) {
      return;
    }

    session.accumulatedMs = 0;
    session.attempts = 0;
    session.viewId = createViewId();
    session.visibleSince = now;
    clearFireTimer(session);
    this.scheduleQualification();
  }

  private resetVisibilitySession(): void {
    const { session } = this;
    session.accumulatedMs = 0;
    session.visibleSince = null;
    session.attempts = 0;
    session.viewId = null;
    clearFireTimer(session);
  }

  private scheduleQualification(): void {
    const { session } = this;
    if (
      session.done ||
      session.fireTimer !== null ||
      !this.hasVisibleMember() ||
      !isPageVisible() ||
      session.viewId === null
    ) {
      return;
    }

    session.fireTimer = setTimeout(() => {
      if (
        session.done ||
        !this.hasVisibleMember() ||
        !isPageVisible() ||
        session.visibleSince === null ||
        session.viewId === null
      ) {
        clearFireTimer(session);
        return;
      }

      this.qualify(NOW());
    }, DEFAULTS.DWELL_MS);
  }

  private qualify(now: number): void {
    const { session } = this;
    if (session.done || session.viewId === null || session.visibleSince === null) return;

    clearFireTimer(session);
    session.attempts = 1;
    session.accumulatedMs = Math.max(0, now - session.visibleSince);
    void this.queueCallback(session.viewId, session.accumulatedMs, session.attempts);
  }

  private endVisibilitySession(now: number): void {
    const { session } = this;
    if (session.done || session.viewId === null) return;

    if (session.visibleSince !== null) {
      session.accumulatedMs = Math.max(session.accumulatedMs, now - session.visibleSince);
    }

    const { viewId, accumulatedMs: totalVisibleMs } = session;
    const qualified = session.attempts > 0;

    this.resetVisibilitySession();

    if (qualified) {
      void this.queueCallback(viewId, totalVisibleMs, 2);
    }
  }

  private async queueCallback(
    viewId: string,
    totalVisibleMs: number,
    attempts: number
  ): Promise<void> {
    if (this.activeStates.size === 0) return;

    const invoke = (): Promise<void> =>
      safeCallAsync(
        () => this.callback({ totalVisibleMs, viewId, attempts }),
        (error) => {
          console.error('[@contentful/experiences] Error in element view callback:', error);
        }
      );
    await chainCallback(this.session, invoke, this.pendingCallbacks);
  }

  private finalizeDroppedState(state: ElementState): void {
    this.sourceController.remove(state);
    finalizeDroppedState(state, { activeStates: this.activeStates, states: this.states });
    this.releaseMember(state);
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

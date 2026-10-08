import { createElementRef } from '../observer-support.js';

export const DEFAULTS = {
  DWELL_MS: 1000,
  SWEEP_INTERVAL_MS: 30000,
} as const;

export interface ElementViewCallbackInfo {
  /** Visible time accumulated in this view session, in milliseconds. */
  readonly totalVisibleMs: number;
  /** Stable for every callback of one view session. */
  readonly viewId: string;
  /** `1` when the view first qualifies (dwell reached), `2` when it ends. */
  readonly attempts: number;
}

export type ElementViewCallback = (info: ElementViewCallbackInfo) => void | Promise<void>;

export interface ElementViewObserverOptions {
  readonly root?: Element | Document | null;
  readonly rootMargin?: string;
}

export type EffectiveObserverOptions = Required<ElementViewObserverOptions>;

/**
 * `element`: the IntersectionObserver watches `target` (the element itself,
 * or its single rendered child when it is `display: contents`). `virtual`:
 * visibility is measured from the element's rendered contents instead.
 */
export type ElementViewSource = 'element' | 'virtual';

export interface ElementState {
  ref: WeakRef<Element> | null;
  strongRef: Element | null;
  source: ElementViewSource;
  target: Element | null;
  done: boolean;
  lastKnownVisible: boolean;
}

export const initElementViewObserverOptions = (
  options?: ElementViewObserverOptions
): EffectiveObserverOptions => ({
  root: options?.root ?? null,
  rootMargin: options?.rootMargin ?? '0px',
});

export const createElementState = (element: Element): ElementState => ({
  ...createElementRef(element),
  source: 'element',
  target: null,
  done: false,
  lastKnownVisible: false,
});

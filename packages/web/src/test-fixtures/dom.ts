import { vi } from 'vitest';

type IOCallback = (entries: IntersectionObserverEntry[]) => void;

const EMPTY_RECT = {
  bottom: 0,
  left: 0,
  right: 0,
  top: 0,
  height: 0,
  width: 0,
  x: 0,
  y: 0,
  toJSON: () => ({}),
} as DOMRectReadOnly;

/** IntersectionObserver without geometry: tests drive it with `trigger()`. */
export class FakeIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null;
  readonly rootMargin: string;
  readonly thresholds: readonly number[];
  readonly observed = new Set<Element>();

  constructor(
    private readonly cb: IOCallback,
    opts?: IntersectionObserverInit
  ) {
    this.root = opts?.root ?? null;
    this.rootMargin = opts?.rootMargin ?? '0px';
    const threshold = opts?.threshold ?? 0;
    this.thresholds = Array.isArray(threshold) ? threshold : [threshold];
  }

  observe = (element: Element): void => {
    this.observed.add(element);
  };
  unobserve = (element: Element): void => {
    this.observed.delete(element);
  };
  disconnect = (): void => {
    this.observed.clear();
  };
  takeRecords = (): IntersectionObserverEntry[] => [];

  trigger(target: Element, isIntersecting: boolean, intersectionRatio = isIntersecting ? 1 : 0) {
    if (!this.observed.has(target)) return;
    this.cb([
      {
        target,
        isIntersecting,
        intersectionRatio,
        time: 0,
        boundingClientRect: EMPTY_RECT,
        intersectionRect: EMPTY_RECT,
        rootBounds: null,
      },
    ]);
  }
}

/** Replaces the global IntersectionObserver; undo with `vi.unstubAllGlobals()`. */
export function installIOPolyfill(): { getLast: () => FakeIntersectionObserver } {
  const instances: FakeIntersectionObserver[] = [];

  class Polyfilled extends FakeIntersectionObserver {
    constructor(cb: IOCallback, opts?: IntersectionObserverInit) {
      super(cb, opts);
      instances.push(this);
    }
  }

  vi.stubGlobal('IntersectionObserver', Polyfilled);

  return {
    getLast: () => {
      const last = instances.at(-1);
      if (!last) throw new Error('IntersectionObserver polyfill instance not found');
      return last;
    },
  };
}

/** Sets `document.visibilityState` and dispatches `visibilitychange`. */
export function setDocumentVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

export function makeElement(tag = 'div'): HTMLElement {
  const element = document.createElement(tag);
  document.body.append(element);
  return element;
}

/** Advances fake timers and flushes the promise callbacks they schedule. */
export async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

export function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

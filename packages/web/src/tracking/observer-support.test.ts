import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addVisibilityChangeListener,
  clearFireTimer,
  safeCallAsync,
  type FireTimerState,
} from './observer-support.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe('observer support', () => {
  it('reports hidden on pagehide and visible on pageshow', () => {
    const handler = vi.fn();
    const cleanup = addVisibilityChangeListener(handler);

    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('pageshow'));
    cleanup?.();
    window.dispatchEvent(new Event('pagehide'));

    expect(handler.mock.calls).toEqual([[false], [true]]);
  });

  it('clears a pending fire timer', () => {
    vi.useFakeTimers();
    const fired = vi.fn();
    const state: FireTimerState = { fireTimer: setTimeout(() => fired(), 10) };

    clearFireTimer(state);
    vi.advanceTimersByTime(20);

    expect(fired).not.toHaveBeenCalled();
    expect(state.fireTimer).toBeNull();
  });

  it('routes a rejected callback to the error handler', async () => {
    const onError = vi.fn();
    await safeCallAsync(() => Promise.reject(new Error('boom')), onError);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }));
  });
});

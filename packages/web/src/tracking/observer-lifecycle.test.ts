import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ensureSweeper,
  finalizeDroppedState,
  stopSweeper,
  sweepOrphans,
} from './observer-lifecycle.js';
import { createElementRef } from './observer-support.js';

interface LifecycleState {
  ref: WeakRef<Element> | null;
  strongRef: Element | null;
  fireTimer: ReturnType<typeof setTimeout> | null;
  done: boolean;
}
const makeState = (element: Element): LifecycleState => ({
  ...createElementRef(element),
  fireTimer: null,
  done: false,
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe('observer lifecycle', () => {
  it('runs the sweep on an interval until stopped', () => {
    vi.useFakeTimers();
    const sweep = vi.fn();

    let handle = ensureSweeper(null, sweep, 1000);
    expect(ensureSweeper(handle, sweep, 1000)).toBe(handle);
    vi.advanceTimersByTime(2500);
    handle = stopSweeper(handle)!;
    vi.advanceTimersByTime(2000);

    expect(sweep).toHaveBeenCalledTimes(2);
    expect(handle).toBeNull();
  });

  it('marks a dropped state done and forgets it', () => {
    const element = document.createElement('div');
    const state = { ...makeState(element), ref: null, strongRef: element };
    const activeStates = new Set([state]);
    const states = new WeakMap([[element, state]]);

    finalizeDroppedState(state, { activeStates, states });

    expect(state.done).toBe(true);
    expect(activeStates.size).toBe(0);
    expect(states.has(element)).toBe(false);
  });

  it('unobserves elements that were removed from the document', () => {
    const connected = document.createElement('div');
    const detached = document.createElement('div');
    document.body.append(connected);
    const activeStates = new Set([makeState(connected), makeState(detached)]);
    const unobserve = vi.fn();

    sweepOrphans({ activeStates, states: new WeakMap() }, unobserve);

    expect(unobserve).toHaveBeenCalledTimes(1);
    expect(unobserve).toHaveBeenCalledWith(detached);
    connected.remove();
  });
});

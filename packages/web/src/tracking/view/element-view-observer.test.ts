// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  advance,
  deferred,
  installIOPolyfill,
  makeElement,
  setDocumentVisibility,
} from '../../test-fixtures/dom.js';

import type { ElementViewCallbackInfo } from './element-view-observer-support.js';
import { ElementViewObserver } from './element-view-observer.js';

type Callback = (element: Element, info: ElementViewCallbackInfo) => Promise<void>;

const infoAt = (cb: ReturnType<typeof vi.fn<Callback>>, index: number): ElementViewCallbackInfo => {
  const info = cb.mock.calls[index]?.[1];
  if (!info) throw new Error(`No callback at index ${index}`);
  return info;
};

describe('ElementViewObserver', () => {
  let io: ReturnType<typeof installIOPolyfill>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    io = installIOPolyfill();
    setDocumentVisibility('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('fires a start callback once the dwell threshold is reached', async () => {
    const element = makeElement();
    const cb = vi.fn<Callback>().mockResolvedValue(undefined);
    new ElementViewObserver(cb).observe(element);

    io.getLast().trigger(element, true, 0.6);
    await advance(999);
    expect(cb).not.toHaveBeenCalled();
    await advance(1);

    expect(cb).toHaveBeenCalledTimes(1);
    expect(infoAt(cb, 0)).toMatchObject({ attempts: 1, totalVisibleMs: 1000 });
  });

  it('emits a final callback with the same viewId and total duration when the view ends', async () => {
    const element = makeElement();
    const cb = vi.fn<Callback>().mockResolvedValue(undefined);
    new ElementViewObserver(cb).observe(element);

    io.getLast().trigger(element, true);
    await advance(1400);
    io.getLast().trigger(element, false);
    await advance(0);

    expect(cb).toHaveBeenCalledTimes(2);
    expect(infoAt(cb, 1)).toMatchObject({
      attempts: 2,
      viewId: infoAt(cb, 0).viewId,
      totalVisibleMs: 1400,
    });
  });

  it('ignores a non-intersecting entry regardless of its ratio', async () => {
    const element = makeElement();
    const cb = vi.fn<Callback>().mockResolvedValue(undefined);
    new ElementViewObserver(cb).observe(element);

    io.getLast().trigger(element, false, 0.05);
    await advance(2000);

    expect(cb).not.toHaveBeenCalled();
  });

  it('qualifies on any part of the element being visible', async () => {
    const element = makeElement();
    const cb = vi.fn<Callback>().mockResolvedValue(undefined);
    new ElementViewObserver(cb).observe(element);

    io.getLast().trigger(element, true, 0.01);
    await advance(1000);

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('does not accumulate dwell across separate visibility sessions', async () => {
    const element = makeElement();
    const cb = vi.fn<Callback>().mockResolvedValue(undefined);
    new ElementViewObserver(cb).observe(element);

    io.getLast().trigger(element, true);
    await advance(600);
    io.getLast().trigger(element, false);
    io.getLast().trigger(element, true);
    await advance(600);

    expect(cb).not.toHaveBeenCalled();
  });

  it('assigns a new viewId to each visibility session', async () => {
    const element = makeElement();
    const cb = vi.fn<Callback>().mockResolvedValue(undefined);
    new ElementViewObserver(cb).observe(element);

    io.getLast().trigger(element, true);
    await advance(1000);
    io.getLast().trigger(element, false);
    io.getLast().trigger(element, true);
    await advance(1000);

    expect(cb).toHaveBeenCalledTimes(3);
    expect(infoAt(cb, 2).attempts).toBe(1);
    expect(infoAt(cb, 2).viewId).not.toBe(infoAt(cb, 0).viewId);
  });

  it('ends the view when the page hides and restarts only in-view elements on return', async () => {
    const onScreen = makeElement();
    const offScreen = makeElement();
    const cb = vi.fn<Callback>().mockResolvedValue(undefined);
    const observer = new ElementViewObserver(cb);
    observer.observe(onScreen);
    observer.observe(offScreen);

    io.getLast().trigger(onScreen, true);
    io.getLast().trigger(offScreen, false);
    await advance(300);
    setDocumentVisibility('hidden');
    setDocumentVisibility('visible');
    await advance(1000);

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]?.[0]).toBe(onScreen);
    expect(infoAt(cb, 0).totalVisibleMs).toBe(1000);
  });

  it('ends once for duplicate hide signals and starts a fresh view on pageshow', async () => {
    const element = makeElement();
    const cb = vi.fn<Callback>().mockResolvedValue(undefined);
    const observer = new ElementViewObserver(cb);
    observer.observe(element);

    io.getLast().trigger(element, true);
    await advance(1250);
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('beforeunload'));
    await observer.endActive();

    expect(cb).toHaveBeenCalledTimes(2);
    expect(infoAt(cb, 1).totalVisibleMs).toBe(1250);

    window.dispatchEvent(new Event('pageshow'));
    await advance(1000);

    expect(cb).toHaveBeenCalledTimes(3);
    expect(infoAt(cb, 2).viewId).not.toBe(infoAt(cb, 0).viewId);
  });

  it('passes per-element data to the callback', async () => {
    const element = makeElement();
    const cb = vi.fn<Callback>().mockResolvedValue(undefined);
    new ElementViewObserver(cb).observe(element, { data: { id: 'hero' } });

    io.getLast().trigger(element, true);
    await advance(1000);

    expect(infoAt(cb, 0).data).toEqual({ id: 'hero' });
  });

  it('serializes the final callback after an in-flight start callback', async () => {
    const element = makeElement();
    const start = deferred();
    const cb = vi
      .fn<Callback>()
      .mockImplementationOnce(() => start.promise)
      .mockResolvedValue(undefined);
    const observer = new ElementViewObserver(cb);
    observer.observe(element);

    io.getLast().trigger(element, true);
    await advance(1250);
    const ending = observer.endActive();

    expect(cb).toHaveBeenCalledTimes(1);
    start.resolve();
    await ending;

    expect(cb).toHaveBeenCalledTimes(2);
    expect(infoAt(cb, 1).viewId).toBe(infoAt(cb, 0).viewId);
  });

  it('still emits the final callback after the start callback fails', async () => {
    const element = makeElement();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const cb = vi
      .fn<Callback>()
      .mockRejectedValueOnce(new Error('fail-once'))
      .mockResolvedValue(undefined);
    const observer = new ElementViewObserver(cb);
    observer.observe(element);

    io.getLast().trigger(element, true);
    await advance(1250);
    await observer.endActive();

    expect(cb).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending dwell when unobserved', async () => {
    const element = makeElement();
    const cb = vi.fn<Callback>().mockResolvedValue(undefined);
    const observer = new ElementViewObserver(cb);
    observer.observe(element);

    io.getLast().trigger(element, true);
    observer.unobserve(element);
    await advance(20_000);

    expect(cb).not.toHaveBeenCalled();
  });

  it('stops observing an element removed from the document on the next sweep', async () => {
    const element = makeElement();
    const cb = vi.fn<Callback>().mockResolvedValue(undefined);
    new ElementViewObserver(cb).observe(element);

    element.remove();
    await advance(30_000);

    expect(io.getLast().observed.has(element)).toBe(false);
  });

  it('disconnect clears timers and the visibility listener', () => {
    const element = makeElement();
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const observer = new ElementViewObserver(vi.fn<Callback>());
    observer.observe(element);

    io.getLast().trigger(element, true);
    observer.disconnect();

    expect(vi.getTimerCount()).toBe(0);
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });

  it('endActive is idempotent and emits nothing for a sub-dwell view', async () => {
    const qualified = makeElement();
    const subDwell = makeElement();
    const cb = vi.fn<Callback>().mockResolvedValue(undefined);
    const observer = new ElementViewObserver(cb);
    observer.observe(qualified);

    io.getLast().trigger(qualified, true);
    await advance(1750);
    observer.observe(subDwell);
    io.getLast().trigger(subDwell, true);
    await advance(500);
    await Promise.all([observer.endActive(), observer.endActive()]);

    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb.mock.calls.every(([target]) => target === qualified)).toBe(true);
    expect(infoAt(cb, 1).totalVisibleMs).toBe(2250);
  });

  describe('display: contents elements', () => {
    const asContents = (element: HTMLElement): HTMLElement => {
      element.style.display = 'contents';
      return element;
    };

    it('observes the single rendered child in place of the element', async () => {
      const wrapper = asContents(makeElement());
      const child = document.createElement('section');
      wrapper.append(child);
      const cb = vi.fn<Callback>().mockResolvedValue(undefined);
      new ElementViewObserver(cb).observe(wrapper);

      expect(io.getLast().observed.has(child)).toBe(true);
      io.getLast().trigger(child, true);
      await advance(1000);

      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb.mock.calls[0]?.[0]).toBe(wrapper);
    });

    it('measures visibility virtually when there are several rendered children', async () => {
      const wrapper = asContents(makeElement());
      wrapper.append(document.createElement('p'), document.createElement('p'));
      const rect = { top: 0, left: 0, bottom: 100, right: 100, width: 100, height: 100 };
      vi.stubGlobal('innerHeight', 800);
      vi.stubGlobal('innerWidth', 800);
      vi.spyOn(document, 'createRange').mockReturnValue({
        selectNodeContents: () => undefined,
        getClientRects: () => [rect] as unknown as DOMRectList,
        detach: () => undefined,
      } as unknown as Range);
      const cb = vi.fn<Callback>().mockResolvedValue(undefined);
      new ElementViewObserver(cb).observe(wrapper);

      expect(io.getLast().observed.size).toBe(0);
      await advance(1020);

      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb.mock.calls[0]?.[0]).toBe(wrapper);
    });

    it('treats virtual contents as not visible where Range client rects are unavailable', async () => {
      const wrapper = asContents(makeElement());
      wrapper.append(document.createElement('p'), document.createElement('p'));
      const cb = vi.fn<Callback>().mockResolvedValue(undefined);
      new ElementViewObserver(cb).observe(wrapper);

      await advance(2000);

      expect(cb).not.toHaveBeenCalled();
    });

    it('re-targets when the single child is replaced', async () => {
      const wrapper = asContents(makeElement());
      const first = document.createElement('section');
      wrapper.append(first);
      new ElementViewObserver(vi.fn<Callback>()).observe(wrapper);

      const second = document.createElement('section');
      first.replaceWith(second);
      await advance(0);

      expect(io.getLast().observed.has(first)).toBe(false);
      expect(io.getLast().observed.has(second)).toBe(true);
    });
  });
});

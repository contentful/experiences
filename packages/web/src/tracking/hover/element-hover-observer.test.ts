// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { advance, deferred, makeElement, setDocumentVisibility } from '../../test-fixtures/dom.js';

import { type ElementHoverCallbackInfo, ElementHoverObserver } from './element-hover-observer.js';

type Callback = (element: Element, info: ElementHoverCallbackInfo) => Promise<void>;

const infoAt = (
  cb: ReturnType<typeof vi.fn<Callback>>,
  index: number
): ElementHoverCallbackInfo => {
  const info = cb.mock.calls[index]?.[1];
  if (!info) throw new Error(`No callback at index ${index}`);
  return info;
};

const enter = (element: Element, pointerType = 'mouse'): void => {
  element.dispatchEvent(new PointerEvent('pointerenter', { pointerType }));
};

const leave = (element: Element, pointerType = 'mouse'): void => {
  element.dispatchEvent(new PointerEvent('pointerleave', { pointerType }));
};

describe('ElementHoverObserver', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    setDocumentVisibility('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('fires a start callback once the dwell threshold is reached', async () => {
    const element = makeElement();
    const cb = vi.fn<Callback>().mockResolvedValue(undefined);
    new ElementHoverObserver(cb).observe(element);

    enter(element);
    await advance(999);
    expect(cb).not.toHaveBeenCalled();
    await advance(1);

    expect(cb).toHaveBeenCalledTimes(1);
    expect(infoAt(cb, 0)).toMatchObject({ attempts: 1, totalHoverMs: 1000 });
  });

  it('emits a final callback with the same hoverId and total duration when the hover ends', async () => {
    const element = makeElement();
    const cb = vi.fn<Callback>().mockResolvedValue(undefined);
    new ElementHoverObserver(cb).observe(element);

    enter(element);
    await advance(1300);
    leave(element);
    await advance(0);

    expect(cb).toHaveBeenCalledTimes(2);
    expect(infoAt(cb, 1)).toMatchObject({
      attempts: 2,
      hoverId: infoAt(cb, 0).hoverId,
      totalHoverMs: 1300,
    });
  });

  it('emits nothing for a hover that ends before the dwell threshold', async () => {
    const element = makeElement();
    const cb = vi.fn<Callback>().mockResolvedValue(undefined);
    new ElementHoverObserver(cb).observe(element);

    enter(element);
    await advance(500);
    leave(element);
    await advance(2000);

    expect(cb).not.toHaveBeenCalled();
  });

  it('assigns a new hoverId to each hover', async () => {
    const element = makeElement();
    const cb = vi.fn<Callback>().mockResolvedValue(undefined);
    new ElementHoverObserver(cb).observe(element);

    enter(element);
    await advance(1000);
    leave(element);
    enter(element);
    await advance(1000);

    expect(cb).toHaveBeenCalledTimes(3);
    expect(infoAt(cb, 2).hoverId).not.toBe(infoAt(cb, 0).hoverId);
  });

  it('ends the hover when the page hides and needs a fresh pointer entry after', async () => {
    const element = makeElement();
    const cb = vi.fn<Callback>().mockResolvedValue(undefined);
    new ElementHoverObserver(cb).observe(element);

    enter(element);
    await advance(300);
    setDocumentVisibility('hidden');
    setDocumentVisibility('visible');
    await advance(2000);
    expect(cb).not.toHaveBeenCalled();

    enter(element);
    await advance(1000);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('ignores touch pointers', async () => {
    const element = makeElement();
    const cb = vi.fn<Callback>().mockResolvedValue(undefined);
    new ElementHoverObserver(cb).observe(element);

    enter(element, 'touch');
    await advance(2000);

    expect(cb).not.toHaveBeenCalled();
  });

  it('passes per-element data to the callback', async () => {
    const element = makeElement();
    const cb = vi.fn<Callback>().mockResolvedValue(undefined);
    new ElementHoverObserver(cb).observe(element, { data: { id: 'hero' } });

    enter(element);
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
    const observer = new ElementHoverObserver(cb);
    observer.observe(element);

    enter(element);
    await advance(1250);
    const ending = observer.endActive();

    expect(cb).toHaveBeenCalledTimes(1);
    start.resolve();
    await ending;

    expect(cb).toHaveBeenCalledTimes(2);
    expect(infoAt(cb, 1).hoverId).toBe(infoAt(cb, 0).hoverId);
  });

  it('still emits the final callback after the start callback fails', async () => {
    const element = makeElement();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const cb = vi
      .fn<Callback>()
      .mockRejectedValueOnce(new Error('fail-once'))
      .mockResolvedValue(undefined);
    const observer = new ElementHoverObserver(cb);
    observer.observe(element);

    enter(element);
    await advance(1250);
    await observer.endActive();

    expect(cb).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending dwell and detaches listeners when unobserved', async () => {
    const element = makeElement();
    const cb = vi.fn<Callback>().mockResolvedValue(undefined);
    const observer = new ElementHoverObserver(cb);
    observer.observe(element);

    enter(element);
    observer.unobserve(element);
    await advance(2000);
    enter(element);
    await advance(2000);

    expect(cb).not.toHaveBeenCalled();
  });

  it('disconnect clears timers and the visibility listener', () => {
    const element = makeElement();
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const observer = new ElementHoverObserver(vi.fn<Callback>());
    observer.observe(element);

    enter(element);
    observer.disconnect();

    expect(vi.getTimerCount()).toBe(0);
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });

  it('endActive is idempotent and emits nothing for a sub-dwell hover', async () => {
    const qualified = makeElement();
    const subDwell = makeElement();
    const cb = vi.fn<Callback>().mockResolvedValue(undefined);
    const observer = new ElementHoverObserver(cb);
    observer.observe(qualified);
    observer.observe(subDwell);

    enter(qualified);
    await advance(1500);
    enter(subDwell);
    await advance(200);
    await Promise.all([observer.endActive(), observer.endActive()]);

    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb.mock.calls.every(([target]) => target === qualified)).toBe(true);
    expect(infoAt(cb, 1).totalHoverMs).toBe(1700);
  });

  describe('sharedSession', () => {
    const shared = (cb: ReturnType<typeof vi.fn<Callback>>) => new ElementHoverObserver(cb);

    it('stays hovered while any member is, under one hoverId', async () => {
      const a = makeElement();
      const b = makeElement();
      const cb = vi.fn<Callback>().mockResolvedValue(undefined);
      const observer = shared(cb);
      observer.observe(a);
      observer.observe(b);

      enter(a);
      await advance(400);
      enter(b);
      await advance(100);
      leave(a);
      await advance(500);

      expect(cb).toHaveBeenCalledTimes(1);
      expect(infoAt(cb, 0)).toMatchObject({ attempts: 1, totalHoverMs: 1000 });

      await advance(300);
      leave(b);
      await advance(0);

      expect(cb).toHaveBeenCalledTimes(2);
      expect(infoAt(cb, 1)).toMatchObject({
        attempts: 2,
        hoverId: infoAt(cb, 0).hoverId,
        totalHoverMs: 1300,
      });
    });

    it('does not restart when a second member is entered mid-hover', async () => {
      const a = makeElement();
      const b = makeElement();
      const cb = vi.fn<Callback>().mockResolvedValue(undefined);
      const observer = shared(cb);
      observer.observe(a);
      observer.observe(b);

      enter(a);
      await advance(900);
      enter(b);
      await advance(100);

      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb.mock.calls[0]?.[0]).toBe(a);
    });

    it('ignores touch pointers', async () => {
      const a = makeElement();
      const cb = vi.fn<Callback>().mockResolvedValue(undefined);
      shared(cb).observe(a);

      enter(a, 'touch');
      await advance(2000);

      expect(cb).not.toHaveBeenCalled();
    });

    it('endActive flushes the shared hover once', async () => {
      const a = makeElement();
      const b = makeElement();
      const cb = vi.fn<Callback>().mockResolvedValue(undefined);
      const observer = shared(cb);
      observer.observe(a);
      observer.observe(b);

      enter(a);
      enter(b);
      await advance(1250);
      await observer.endActive();

      expect(cb).toHaveBeenCalledTimes(2);
      expect(infoAt(cb, 1)).toMatchObject({ attempts: 2, totalHoverMs: 1250 });
    });

    it('keeps the hover when one of two hovered members is unobserved', async () => {
      const a = makeElement();
      const b = makeElement();
      const cb = vi.fn<Callback>().mockResolvedValue(undefined);
      const observer = shared(cb);
      observer.observe(a);
      observer.observe(b);

      enter(a);
      enter(b);
      await advance(500);
      observer.unobserve(a);
      await advance(500);

      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb.mock.calls[0]?.[0]).toBe(b);
    });

    it('drops the hover silently when the last member is unobserved', async () => {
      const a = makeElement();
      const cb = vi.fn<Callback>().mockResolvedValue(undefined);
      const observer = shared(cb);
      observer.observe(a);

      enter(a);
      await advance(500);
      observer.unobserve(a);
      await advance(20_000);

      expect(cb).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});

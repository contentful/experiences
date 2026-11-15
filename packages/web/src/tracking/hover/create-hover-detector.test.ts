import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advance, deferred, makeElement, setDocumentVisibility } from '../../test/dom.js';

import { EXPERIENCE, FRAGMENT } from '../../test/fixtures/tracking-attribution.js';
import { keyOf, lookup, resetDetectorKeys } from '../../test/detectors.js';

import { createHoverDetector } from './create-hover-detector.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  setDocumentVisibility('visible');
});

afterEach(() => {
  resetDetectorKeys();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('createHoverDetector', () => {
  const hover = async (element: Element, ms: number): Promise<void> => {
    element.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
    await advance(ms);
    element.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
    await advance(0);
  };

  it('sends a Fragment hover when it qualifies and again when it ends, under one hoverId', async () => {
    const trackHover = vi.fn().mockResolvedValue(true);
    const element = makeElement();
    const detector = createHoverDetector(trackHover, lookup(new Map([[element, FRAGMENT]])));
    detector.onElementAdded(element, keyOf(element));
    detector.start();

    await hover(element, 1200);

    expect(trackHover).toHaveBeenCalledTimes(2);
    const [first, second] = trackHover.mock.calls.map(([args]) => args);
    expect(first).toMatchObject({
      entityId: 'hero',
      parentExperienceId: 'landing',
      hoverDurationMs: 1000,
    });
    expect(second).toMatchObject({ hoverId: first.hoverId, hoverDurationMs: 1200 });
  });

  it('never sends hovers for an Experience', async () => {
    const trackHover = vi.fn().mockResolvedValue(true);
    const element = makeElement();
    const detector = createHoverDetector(trackHover, lookup(new Map([[element, EXPERIENCE]])));
    detector.onElementAdded(element, keyOf(element));
    detector.start();

    await hover(element, 1500);

    expect(trackHover).not.toHaveBeenCalled();
  });

  it('does not observe an element whose key is ineligible', () => {
    const element = makeElement();
    const listen = vi.spyOn(element, 'addEventListener');
    const detector = createHoverDetector(
      vi.fn().mockResolvedValue(true),
      lookup(new Map([[element, EXPERIENCE]]))
    );
    detector.start();
    detector.onElementAdded(element, keyOf(element));

    expect(listen).not.toHaveBeenCalled();
  });

  it('keeps the final event attributed to the entity that qualified, even when a slow send delays it past a refresh()', async () => {
    const qualifying = deferred<boolean>();
    const trackHover = vi
      .fn()
      .mockImplementationOnce(() => qualifying.promise)
      .mockResolvedValue(true);
    const element = makeElement();
    const attributions = new Map([[element, { ...FRAGMENT, entityId: 'A' }]]);
    const detector = createHoverDetector(trackHover, lookup(attributions));
    detector.onElementAdded(element, keyOf(element));
    detector.start();

    element.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
    await advance(1000);
    expect(trackHover).toHaveBeenCalledTimes(1);

    element.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
    await advance(0);

    attributions.set(element, { ...FRAGMENT, entityId: 'B' });

    qualifying.resolve(true);
    await advance(0);

    expect(trackHover).toHaveBeenCalledTimes(2);
    const [first, second] = trackHover.mock.calls.map(([args]) => args);
    expect(first).toMatchObject({ entityId: 'A' });
    expect(second).toMatchObject({ entityId: 'A', hoverId: first.hoverId });
  });
});

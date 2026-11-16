import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  advance,
  deferred,
  installIOPolyfill,
  makeElement,
  setDocumentVisibility,
} from '../../test/dom.js';

import { EXPERIENCE, FRAGMENT } from '../../test/fixtures/tracking-attribution.js';
import { keyOf, lookup, resetDetectorKeys } from '../../test/detectors.js';

import { createViewDetector } from './create-view-detector.js';

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

describe('createViewDetector', () => {
  it('sends a view when it qualifies and again with its final duration, under one viewId', async () => {
    const io = installIOPolyfill();
    const trackView = vi.fn().mockResolvedValue(true);
    const element = makeElement();
    const detector = createViewDetector(trackView, lookup(new Map([[element, EXPERIENCE]])));
    detector.onElementAdded(element, keyOf(element));
    detector.start();

    io.getLast().trigger(element, true);
    await advance(1500);
    io.getLast().trigger(element, false);
    await advance(0);

    expect(trackView).toHaveBeenCalledTimes(2);
    const [first, second] = trackView.mock.calls.map(([args]) => args);
    expect(first).toMatchObject({
      entityId: 'landing',
      entityKind: 'Experience',
      viewDurationMs: 1000,
    });
    expect(second).toMatchObject({ viewId: first.viewId, viewDurationMs: 1500 });
  });

  it('observes nothing until started and nothing after stopping', async () => {
    const io = installIOPolyfill();
    const trackView = vi.fn().mockResolvedValue(true);
    const element = makeElement();
    const detector = createViewDetector(trackView, lookup(new Map([[element, FRAGMENT]])));

    detector.onElementAdded(element, keyOf(element));
    detector.start();
    expect(io.getLast().observed.has(element)).toBe(true);
    detector.stop();

    expect(io.getLast().observed.size).toBe(0);
  });

  it('drops the event when attribution no longer resolves', async () => {
    const io = installIOPolyfill();
    const trackView = vi.fn().mockResolvedValue(true);
    const element = makeElement();
    const attributions = new Map([[element, FRAGMENT]]);
    const detector = createViewDetector(trackView, lookup(attributions));
    detector.onElementAdded(element, keyOf(element));
    detector.start();

    attributions.clear();
    io.getLast().trigger(element, true);
    await advance(1000);

    expect(trackView).not.toHaveBeenCalled();
  });

  it('stays inert where IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const element = makeElement();
    const detector = createViewDetector(vi.fn(), lookup(new Map([[element, FRAGMENT]])));

    expect(() => {
      detector.onElementAdded(element, keyOf(element));
      detector.start();
      detector.stop();
    }).not.toThrow();
  });

  it('logs rather than throws when trackView rejects', async () => {
    const io = installIOPolyfill();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const trackView = vi.fn().mockRejectedValue(new Error('no profile'));
    const element = makeElement();
    const detector = createViewDetector(trackView, lookup(new Map([[element, FRAGMENT]])));
    detector.onElementAdded(element, keyOf(element));
    detector.start();

    io.getLast().trigger(element, true);
    await advance(1000);

    expect(error).toHaveBeenCalledWith(
      '[@contentful/experiences] Error in element view callback:',
      expect.objectContaining({ message: 'no profile' })
    );
  });

  it('keeps the final event attributed to the entity that qualified, even when a slow send delays it past a refresh()', async () => {
    const io = installIOPolyfill();
    const qualifying = deferred<boolean>();
    const trackView = vi
      .fn()
      .mockImplementationOnce(() => qualifying.promise)
      .mockResolvedValue(true);
    const element = makeElement();
    const attributions = new Map([[element, { ...FRAGMENT, entityId: 'A' }]]);
    const detector = createViewDetector(trackView, lookup(attributions));
    detector.onElementAdded(element, keyOf(element));
    detector.start();

    // A becomes visible and qualifies; its send stays pending.
    io.getLast().trigger(element, true);
    await advance(1000);
    expect(trackView).toHaveBeenCalledTimes(1);

    // A leaves view; the final callback queues behind the pending send.
    io.getLast().trigger(element, false);
    await advance(0);

    // The same key now resolves to a different entity, as `refresh()` would
    // apply after re-resolving attribution for the same DOM.
    attributions.set(element, { ...FRAGMENT, entityId: 'B' });

    // The qualifying send completes, letting the queued final callback run.
    qualifying.resolve(true);
    await advance(0);

    expect(trackView).toHaveBeenCalledTimes(2);
    const [first, second] = trackView.mock.calls.map(([args]) => args);
    expect(first).toMatchObject({ entityId: 'A' });
    expect(second).toMatchObject({ entityId: 'A', viewId: first.viewId });
  });

  it('cancels a pending final drain when its owner resets after the detector is stopped', async () => {
    const io = installIOPolyfill();
    const qualifying = deferred<boolean>();
    const trackView = vi.fn().mockImplementation(() => qualifying.promise);
    const element = makeElement();
    let resetToken = {};
    const detector = createViewDetector(
      trackView,
      lookup(new Map([[element, EXPERIENCE]])),
      undefined,
      () => resetToken
    );
    detector.onElementAdded(element, keyOf(element));
    detector.start();
    io.trigger(element, true);
    await advance(1000);
    expect(trackView).toHaveBeenCalledOnce();

    // Session.stop starts its final drain before releasing the detector.
    const drained = detector.endActive!();
    detector.stop({ preservePending: true });
    resetToken = {};
    qualifying.resolve(true);
    await drained;

    expect(trackView).toHaveBeenCalledOnce();
  });
});

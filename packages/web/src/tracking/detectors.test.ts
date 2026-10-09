// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  advance,
  deferred,
  installIOPolyfill,
  makeElement,
  setDocumentVisibility,
} from '../test-fixtures/dom.js';

import { TRACKING_SCOPES_ATTRIBUTE } from '../tracking-attributes.js';

import type { TrackingAttribution } from './attribution.js';
import { createClickDetector } from './click/create-click-detector.js';
import { createHoverDetector } from './hover/create-hover-detector.js';
import { createViewDetector } from './view/create-view-detector.js';

const EXPERIENCE: TrackingAttribution = { entityId: 'landing', entityKind: 'Experience' };
const FRAGMENT: TrackingAttribution = {
  entityId: 'hero',
  entityKind: 'Fragment',
  entityKindId: 'hero-component',
  parentExperienceId: 'landing',
  variantIndex: 1,
};

/** One scope occurrence key per element, so a test can treat an element as its own occurrence. */
const keys = new Map<Element, string>();
const keyOf = (element: Element): string => {
  let key = keys.get(element);
  if (!key) keys.set(element, (key = `s${keys.size}`));
  return key;
};

/** Resolves attribution from a per-test element → attribution map, through each element's key. */
const lookup = (map: Map<Element, TrackingAttribution>) => (key: string) => {
  for (const [element, attribution] of map) if (keyOf(element) === key) return attribution;
  return undefined;
};

const click = (target: Node): void => {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  setDocumentVisibility('visible');
});

afterEach(() => {
  keys.clear();
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

describe('createClickDetector', () => {
  const setup = (entries: [Element, TrackingAttribution][]) => {
    const trackClick = vi.fn().mockResolvedValue(true);
    const detector = createClickDetector(trackClick, lookup(new Map(entries)));
    for (const [element] of entries) {
      element.setAttribute(TRACKING_SCOPES_ATTRIBUTE, keyOf(element));
      detector.onElementAdded(element, keyOf(element));
    }
    detector.start();
    return { trackClick, detector };
  };

  it('sends a click on interactive content inside a Fragment', () => {
    const fragment = makeElement();
    const button = document.createElement('button');
    fragment.append(button);
    const { trackClick } = setup([[fragment, FRAGMENT]]);

    click(button);

    expect(trackClick).toHaveBeenCalledTimes(1);
    expect(trackClick.mock.calls[0]![0]).toMatchObject({ entityId: 'hero', variantIndex: 1 });
  });

  it('logs rather than throws when trackClick rejects', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fragment = makeElement();
    const button = document.createElement('button');
    fragment.append(button);
    const { trackClick } = setup([[fragment, FRAGMENT]]);
    trackClick.mockRejectedValue(new Error('no profile'));

    click(button);
    await advance(0);

    expect(error).toHaveBeenCalledWith(
      '[@contentful/experiences] Error in click tracking:',
      expect.objectContaining({ message: 'no profile' })
    );
  });

  it("sends only attribution fields, dropping extra properties on the caller's object", () => {
    const fragment = makeElement();
    const button = document.createElement('button');
    fragment.append(button);
    const withExtras = {
      ...FRAGMENT,
      trackingRoot: true,
      internalNote: 'x',
    } as TrackingAttribution;
    const { trackClick } = setup([[fragment, withExtras]]);

    click(button);

    expect(Object.keys(trackClick.mock.calls[0]![0]).sort()).toEqual(
      [
        'entityId',
        'entityKind',
        'entityKindId',
        'entryIds',
        'optimizationId',
        'parentExperienceId',
        'variantId',
        'variantIndex',
      ].sort()
    );
  });

  it('ignores clicks on non-interactive content', () => {
    const fragment = makeElement();
    const text = document.createElement('p');
    fragment.append(text);
    const { trackClick } = setup([[fragment, FRAGMENT]]);

    click(text);
    click(fragment);

    expect(trackClick).not.toHaveBeenCalled();
  });

  it('counts opted-in and onclick-handled content as interactive', () => {
    const fragment = makeElement();
    const optedIn = document.createElement('div');
    optedIn.setAttribute('data-ctfl-clickable', 'true');
    const handled = document.createElement('div');
    handled.onclick = () => undefined;
    fragment.append(optedIn, handled);
    const { trackClick } = setup([[fragment, FRAGMENT]]);

    click(optedIn);
    click(handled);

    expect(trackClick).toHaveBeenCalledTimes(2);
  });

  it('resolves a click on a text node to its parent element', () => {
    const fragment = makeElement();
    const link = document.createElement('a');
    link.href = '#';
    const text = document.createTextNode('Read more');
    link.append(text);
    fragment.append(link);
    const { trackClick } = setup([[fragment, FRAGMENT]]);

    click(text);

    expect(trackClick).toHaveBeenCalledTimes(1);
  });

  it('attributes a click to the nearest tracked element only', () => {
    const outer = makeElement();
    const inner = document.createElement('div');
    const button = document.createElement('button');
    inner.append(button);
    outer.append(inner);
    const { trackClick } = setup([
      [outer, { ...FRAGMENT, entityId: 'outer' }],
      [inner, { ...FRAGMENT, entityId: 'inner' }],
    ]);

    click(button);

    expect(trackClick).toHaveBeenCalledTimes(1);
    expect(trackClick.mock.calls[0]![0].entityId).toBe('inner');
  });

  it('attributes a click in a Fragment nested in an Experience to the Fragment', () => {
    const experience = makeElement();
    const fragment = document.createElement('div');
    const button = document.createElement('button');
    fragment.append(button);
    experience.append(fragment);
    const { trackClick } = setup([
      [experience, EXPERIENCE],
      [fragment, FRAGMENT],
    ]);

    click(button);

    expect(trackClick).toHaveBeenCalledTimes(1);
    expect(trackClick.mock.calls[0]![0].entityKind).toBe('Fragment');
  });

  it('never sends clicks for an Experience', () => {
    const experience = makeElement();
    const button = document.createElement('button');
    experience.append(button);
    const { trackClick } = setup([[experience, EXPERIENCE]]);

    click(button);

    expect(trackClick).not.toHaveBeenCalled();
  });

  it('keeps tracking an element handed over under two keys until both are removed', () => {
    const fragment = makeElement();
    const button = document.createElement('button');
    fragment.append(button);
    fragment.setAttribute(TRACKING_SCOPES_ATTRIBUTE, 'outer inner');
    const trackClick = vi.fn().mockResolvedValue(true);
    const detector = createClickDetector(trackClick, (key) => ({ ...FRAGMENT, entityId: key }));
    detector.onElementAdded(fragment, 'outer');
    detector.onElementAdded(fragment, 'inner');
    detector.start();

    detector.onElementRemoved(fragment, 'outer');
    click(button);
    expect(trackClick).toHaveBeenCalledTimes(1);

    detector.onElementRemoved(fragment, 'inner');
    click(button);
    expect(trackClick).toHaveBeenCalledTimes(1);
  });

  it('stops attributing removed elements and listening after stop', () => {
    const fragment = makeElement();
    const button = document.createElement('button');
    fragment.append(button);
    const { trackClick, detector } = setup([[fragment, FRAGMENT]]);

    detector.onElementRemoved(fragment, keyOf(fragment));
    click(button);
    detector.onElementAdded(fragment, keyOf(fragment));
    detector.stop();
    click(button);

    expect(trackClick).not.toHaveBeenCalled();
  });
});

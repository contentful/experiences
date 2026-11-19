// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrackingAttribution } from './attribution.js';
import type { InteractionKey } from './interaction-detector.js';
import type { EntryInteraction } from './types.js';
import { reconcileTrackedElement, type ElementTrackingEntry } from './reconcile-tracked-element.js';
import { ATTRIBUTIONS, FRAGMENT, setAttributions, stamped } from '../test/tracking-dom.js';

function setup(type: EntryInteraction = 'views', auto = true) {
  setAttributions(document.body, ATTRIBUTIONS);
  const element = stamped('node-experience node-fragment');
  const boundary = document.createElement('section');
  boundary.append(element);
  document.body.append(boundary);
  const manual = new Map<symbol, TrackingAttribution>();
  const detector = {
    start: vi.fn(),
    stop: vi.fn(),
    onElementAdded: vi.fn(),
    onElementRemoved: vi.fn(),
  };
  const entry: ElementTrackingEntry = {
    type,
    auto,
    running: true,
    detector,
    overrides: new Map(),
    observed: new Map(),
  };
  const resolve = (key: InteractionKey) =>
    typeof key === 'symbol'
      ? manual.get(key)
      : typeof key === 'object'
        ? key.attribution
        : undefined;
  const reconcile = () => reconcileTrackedElement(entry, element, resolve);
  return { entry, element, boundary, detector, manual, reconcile };
}

afterEach(() => {
  document.body.replaceChildren();
  document.body.removeAttribute('data-ctfl-attribution');
});

describe('reconcileTrackedElement policy', () => {
  it.each(['views', 'hovers', 'clicks'] as const)(
    'applies %s DOM opt-ins ahead of automatic policy and explicit overrides ahead of both',
    (type) => {
      const { entry, element, detector, reconcile } = setup(type, false);
      reconcile();
      expect(detector.onElementAdded).not.toHaveBeenCalled();
      element.setAttribute(`data-ctfl-track-${type}`, ' TRUE ');
      reconcile();
      expect(entry.observed.get(element)?.size).toBe(2);
      entry.overrides.set(element, { enabled: false, key: Symbol() });
      reconcile();
      expect(entry.observed.has(element)).toBe(false);
      expect(detector.onElementRemoved).toHaveBeenCalledTimes(2);
      for (const call of detector.onElementRemoved.mock.calls)
        expect(call[2]).toEqual({ finalize: false });
      element.setAttribute(`data-ctfl-track-${type}`, 'false');
      entry.overrides.set(element, { enabled: true, key: Symbol() });
      reconcile();
      expect(entry.observed.get(element)?.size).toBe(2);
      entry.overrides.clear();
      reconcile();
      expect(entry.observed.has(element)).toBe(false);
    }
  );

  it.each([
    [true, null, 2],
    [true, 'false', 0],
    [true, 'invalid', 2],
    [false, null, 0],
    [false, 'false', 0],
    [false, 'true', 2],
  ] as const)('uses auto=%s and attribute=%s to select %s keys', (auto, attr, count) => {
    const { element, entry, reconcile } = setup('views', auto);
    if (attr !== null) element.setAttribute('data-ctfl-track-views', attr);
    reconcile();
    expect(entry.observed.get(element)?.size ?? 0).toBe(count);
  });

  it.each(['views', 'hovers', 'clicks'] as const)(
    'uses valid explicit %s attribution as a private occurrence and falls back to automatic keys without it',
    (type) => {
      const { entry, element, manual, detector, reconcile } = setup(type, false);
      const key = Symbol();
      manual.set(key, { ...FRAGMENT, entityId: 'explicit' });
      entry.overrides.set(element, { enabled: true, key });
      reconcile();
      expect([...entry.observed.get(element)!.keys()]).toEqual([key]);
      expect(detector.onElementAdded).toHaveBeenCalledWith(element, key);
      manual.delete(key);
      reconcile();
      expect(detector.onElementRemoved).toHaveBeenCalledWith(element, key, { finalize: true });
      expect(entry.observed.get(element)?.size).toBe(2);
    }
  );

  it('does no reconciliation while its detector is stopped', () => {
    const { entry, detector, reconcile } = setup();
    reconcile();
    entry.running = false;
    entry.auto = false;
    detector.onElementRemoved.mockClear();
    reconcile();
    expect(detector.onElementRemoved).not.toHaveBeenCalled();
    expect(entry.observed.size).toBe(1);
  });

  it('leaves elements without resolvable attribution unobserved', () => {
    const { element, entry, detector, reconcile } = setup();
    element.setAttribute('data-ctfl-scopes', 'missing');
    reconcile();
    expect(entry.observed.size).toBe(0);
    expect(detector.onElementAdded).not.toHaveBeenCalled();
  });
});

describe('reconcileTrackedElement manual-view selection', () => {
  it('selects the final per-root occurrence ahead of a false view attribute and automatic policy', () => {
    const { boundary, element, entry, detector, reconcile } = setup('views', false);
    boundary.setAttribute('data-ctfl-manual-views', ' TRUE ');
    element.setAttribute('data-ctfl-track-views', 'false');
    reconcile();
    const [key] = entry.observed.get(element)!.keys();
    expect(key).toMatchObject({ attribution: FRAGMENT });
    expect(detector.onElementAdded).toHaveBeenCalledTimes(1);
    entry.overrides.set(element, { enabled: false, key: Symbol() });
    reconcile();
    expect(entry.observed.has(element)).toBe(false);
  });

  it.each([null, 'false', 'invalid', ''])(
    'restores ordinary occurrence grouping when the nearest marker becomes %s',
    (marker) => {
      const { boundary, element, entry, detector, reconcile } = setup();
      boundary.setAttribute('data-ctfl-manual-views', 'true');
      reconcile();
      const [previous] = entry.observed.get(element)!.keys();
      if (marker === null) boundary.removeAttribute('data-ctfl-manual-views');
      else boundary.setAttribute('data-ctfl-manual-views', marker);
      reconcile();
      expect(detector.onElementRemoved).toHaveBeenCalledWith(element, previous, { finalize: true });
      expect(entry.observed.get(element)?.size).toBe(2);
    }
  );

  it('lets explicit data and invalid-data automatic fallback precede manual marker policy', () => {
    const { boundary, element, entry, manual, reconcile } = setup('views', false);
    boundary.setAttribute('data-ctfl-manual-views', 'true');
    const key = Symbol();
    entry.overrides.set(element, { enabled: true, key });
    manual.set(key, FRAGMENT);
    reconcile();
    expect([...entry.observed.get(element)!.keys()]).toEqual([key]);
    manual.delete(key);
    reconcile();
    expect(entry.observed.get(element)?.size).toBe(2);
    entry.overrides.clear();
    reconcile();
    expect(entry.observed.get(element)?.size).toBe(1);
  });
});

describe('reconcileTrackedElement occurrence changes', () => {
  it('removes only keys no longer selected and finalizes a still-enabled element', () => {
    const { element, entry, detector, reconcile } = setup();
    reconcile();
    const [page, fragment] = entry.observed.get(element)!.keys();
    detector.onElementAdded.mockClear();
    element.setAttribute('data-ctfl-scopes', 'node-experience');
    reconcile();
    expect([...entry.observed.get(element)!.keys()]).toEqual([page]);
    expect(detector.onElementRemoved).toHaveBeenCalledExactlyOnceWith(element, fragment, {
      finalize: true,
    });
    expect(detector.onElementAdded).not.toHaveBeenCalled();
  });

  it('replaces all automatic occurrences when boundary metadata changes', () => {
    const { element, entry, detector, reconcile } = setup();
    reconcile();
    const previous = [...entry.observed.get(element)!.keys()];
    detector.onElementAdded.mockClear();
    setAttributions(document.body, {
      ...ATTRIBUTIONS,
      'node-fragment': { ...FRAGMENT, entityId: 'replacement' },
    });
    reconcile();
    for (const key of previous)
      expect(detector.onElementRemoved).toHaveBeenCalledWith(element, key, { finalize: true });
    expect(detector.onElementAdded).toHaveBeenCalledTimes(2);
    expect([...entry.observed.get(element)!.keys()]).not.toEqual(previous);
  });

  it.each(['views', 'hovers'] as const)(
    'rekeys %s when only the root Experience variant changes',
    (type) => {
      const { entry, element, detector, reconcile } = setup(type);
      element.setAttribute('data-ctfl-scopes', 'node-fragment');
      const attribution = { ...FRAGMENT, variantId: 'own', parentVariantId: 'first' };
      setAttributions(document.body, { 'node-fragment': attribution });
      reconcile();
      const [previous] = entry.observed.get(element)!.keys();
      setAttributions(document.body, {
        'node-fragment': { ...attribution, parentVariantId: 'second' },
      });
      reconcile();
      expect(detector.onElementRemoved).toHaveBeenCalledWith(element, previous, { finalize: true });
      expect([...entry.observed.get(element)!.keys()][0]).toMatchObject({
        attribution: { variantId: 'own', parentVariantId: 'second' },
      });
    }
  );

  it('does not restart manual measurements after equivalent or unrelated metadata updates', () => {
    const { boundary, element, detector, reconcile } = setup();
    boundary.setAttribute('data-ctfl-manual-views', 'true');
    reconcile();
    detector.onElementAdded.mockClear();
    setAttributions(document.body, {
      'node-fragment': { ...FRAGMENT },
      'node-experience': { entityId: 'different', entityKind: 'Experience' },
    });
    element.setAttribute('data-ctfl-scopes', 'other node-experience node-fragment ');
    reconcile();
    expect(detector.onElementRemoved).not.toHaveBeenCalled();
    expect(detector.onElementAdded).not.toHaveBeenCalled();
  });

  it.each([true, false])('finalizes disconnected membership even with auto=%s', (auto) => {
    const { entry, element, detector, reconcile } = setup();
    reconcile();
    element.remove();
    entry.auto = auto;
    reconcile();
    expect(entry.observed.has(element)).toBe(false);
    expect(detector.onElementRemoved).toHaveBeenCalledTimes(2);
    for (const call of detector.onElementRemoved.mock.calls)
      expect(call[2]).toEqual({ finalize: true });
  });

  it('finalizes changed explicit attribution under the same private occurrence key', () => {
    const { entry, element, manual, detector, reconcile } = setup();
    const key = Symbol();
    const attribution = { ...FRAGMENT };
    manual.set(key, attribution);
    entry.overrides.set(element, { enabled: true, key });
    reconcile();
    detector.onElementAdded.mockClear();
    attribution.entityId = 'replacement';
    reconcile();
    expect(detector.onElementRemoved).toHaveBeenCalledExactlyOnceWith(element, key, {
      finalize: true,
    });
    expect(detector.onElementAdded).toHaveBeenCalledExactlyOnceWith(element, key);
  });
});

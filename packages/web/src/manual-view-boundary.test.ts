// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { createInteractionTracking } from './interaction-tracking.js';
import { installIOPolyfill } from './test-fixtures/dom.js';
import type { TrackingAttribution } from './tracking/attribution.js';

const PAGE: TrackingAttribution = { entityId: 'page', entityKind: 'Experience' };
const HERO: TrackingAttribution = { entityId: 'hero', entityKind: 'ExperienceFragment' };
const metadata = (element: Element, scopes: Record<string, unknown> = { page: PAGE, hero: HERO }) =>
  element.setAttribute('data-ctfl-attribution', JSON.stringify({ scopes }));
const root = (scopes = 'page hero') => {
  const element = document.createElement('button');
  element.setAttribute('data-ctfl-scopes', scopes);
  return element;
};
const marker = () => {
  const element = document.createElement('section');
  element.setAttribute('data-ctfl-manual-views', 'true');
  document.body.append(element);
  return element;
};
function setup(auto = false, allowed = () => true) {
  const io = installIOPolyfill();
  const events = {
    trackView: vi.fn().mockResolvedValue(true),
    trackHover: vi.fn().mockResolvedValue(true),
    trackClick: vi.fn().mockResolvedValue(true),
  };
  const tracking = createInteractionTracking(
    events,
    { views: auto, hovers: auto, clicks: auto },
    { isAllowed: allowed }
  );
  onTestFinished(() => tracking.destroy());
  async function qualify(...elements: Element[]) {
    for (const element of elements) io.trigger(element, true);
    await vi.advanceTimersByTimeAsync(1000);
  }
  return { io, events, tracking, qualify };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  metadata(document.body);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  document.body.removeAttribute('data-ctfl-attribution');
});

describe('declarative manual views', () => {
  it('measures each root independently using only its final scope, without enabling other interactions', async () => {
    const boundary = marker();
    const first = root();
    const second = root();
    first.setAttribute('data-ctfl-track-views', 'false');
    boundary.append(first, second);
    const { qualify, events, tracking } = setup();
    for (const element of [first, second]) {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      element.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
    }
    await qualify(first, second);
    expect(events.trackView).toHaveBeenCalledTimes(2);
    expect(events.trackView.mock.calls.map(([args]) => args.entityId)).toEqual(['hero', 'hero']);
    expect(new Set(events.trackView.mock.calls.map(([args]) => args.viewId)).size).toBe(2);
    expect(events.trackClick).not.toHaveBeenCalled();
    expect(events.trackHover).not.toHaveBeenCalled();
    await tracking.endActive();
    expect(events.trackView).toHaveBeenCalledTimes(4);
  });

  it.each([
    ['page missing', undefined],
    ['page invalid', undefined],
    ['page hero', '{'],
    ['page hero', 'null'],
    ['page hero', '{"scopes":[]}'],
  ])('does not fall back from scope %s with invalid nearest metadata %s', async (scopes, raw) => {
    metadata(document.body, { page: PAGE, hero: HERO, invalid: { ...HERO, entryIds: [42] } });
    const boundary = marker();
    if (raw) boundary.setAttribute('data-ctfl-attribution', raw);
    const element = root(scopes);
    boundary.append(element);
    const { qualify, events } = setup();
    await qualify(element);
    expect(events.trackView).not.toHaveBeenCalled();
  });

  it('uses nearest attribution and preserves timers across equivalent and unrelated metadata updates', async () => {
    const boundary = marker();
    const selected = { ...HERO, entityId: 'inner' };
    metadata(boundary, { page: PAGE, hero: selected });
    const element = root();
    boundary.append(element);
    const { io, events } = setup();
    io.trigger(element, true);
    await vi.advanceTimersByTimeAsync(600);
    metadata(boundary, {
      hero: { entityKind: 'ExperienceFragment', entityId: 'inner' },
      page: { ...PAGE, entityId: 'changed' },
    });
    element.setAttribute('data-ctfl-scopes', 'other page hero  ');
    await vi.advanceTimersByTimeAsync(600);
    expect(events.trackView).toHaveBeenCalledOnce();
    expect(events.trackView.mock.calls[0]![0]).toMatchObject({ entityId: 'inner' });
  });

  it('finalizes the previous measurement and restarts when selected attribution changes', async () => {
    const boundary = marker();
    const element = root();
    boundary.append(element);
    const { qualify, events } = setup();
    await qualify(element);
    metadata(document.body, { hero: { ...HERO, parentVariantId: 'new' } });
    await vi.advanceTimersByTimeAsync(0);
    await qualify(element);
    const [first, final, next] = events.trackView.mock.calls.map(([args]) => args);
    expect(events.trackView).toHaveBeenCalledTimes(3);
    expect(final.viewId).toBe(first.viewId);
    expect(next).toMatchObject({ parentVariantId: 'new' });
    expect(next.viewId).not.toBe(first.viewId);
  });

  it('discovers marker changes, nested markers, dynamic descendants and moves without duplicates', async () => {
    const boundary = document.createElement('section');
    const element = root();
    boundary.append(element);
    document.body.append(boundary);
    const { qualify, events } = setup();
    boundary.setAttribute('data-ctfl-manual-views', ' TRUE ');
    await vi.advanceTimersByTimeAsync(0);
    await qualify(element);
    expect(events.trackView).toHaveBeenCalledOnce();
    const nested = document.createElement('section');
    nested.setAttribute('data-ctfl-manual-views', 'true');
    boundary.append(nested);
    nested.append(element);
    const added = root();
    nested.append(added);
    await vi.advanceTimersByTimeAsync(0);
    await qualify(added);
    expect(events.trackView).toHaveBeenCalledTimes(2);
    boundary.removeAttribute('data-ctfl-manual-views');
    nested.removeAttribute('data-ctfl-manual-views');
    await vi.advanceTimersByTimeAsync(0);
    const count = events.trackView.mock.calls.length;
    await qualify(element, added);
    expect(events.trackView).toHaveBeenCalledTimes(count);
  });

  it.each([null, 'false', 'invalid', ''])(
    'restores ordinary grouping when the marker becomes %s',
    async (value) => {
      const boundary = marker();
      const first = root('hero');
      const second = root('hero');
      boundary.append(first, second);
      const { qualify, events } = setup(true);
      await qualify(first, second);
      expect(events.trackView).toHaveBeenCalledTimes(2);
      if (value === null) boundary.removeAttribute('data-ctfl-manual-views');
      else boundary.setAttribute('data-ctfl-manual-views', value);
      await vi.advanceTimersByTimeAsync(0);
      events.trackView.mockClear();
      await qualify(first, second);
      expect(events.trackView).toHaveBeenCalledOnce();
    }
  );

  it('honors explicit disable, valid manual data and invalid-data automatic fallback ahead of marker policy', async () => {
    const element = root();
    marker().append(element);
    const { qualify, events, tracking } = setup();
    tracking.tracking.disableElement('views', element);
    await qualify(element);
    expect(events.trackView).not.toHaveBeenCalled();
    tracking.tracking.enableElement('views', element, { data: { ...HERO, entityId: 'explicit' } });
    await qualify(element);
    expect(events.trackView.mock.calls[0]![0].entityId).toBe('explicit');
    tracking.tracking.enableElement('views', element, { data: {} });
    await vi.advanceTimersByTimeAsync(0);
    events.trackView.mockClear();
    await qualify(element);
    expect(events.trackView.mock.calls.map(([args]) => args.entityId).sort()).toEqual([
      'hero',
      'page',
    ]);
    tracking.tracking.clearElement('views', element);
    await vi.advanceTimersByTimeAsync(0);
    events.trackView.mockClear();
    await qualify(element);
    expect(events.trackView.mock.calls.map(([args]) => args.entityId)).toEqual(['hero']);
  });

  it('discards measurements on consent withdrawal and reset, rediscovers policy and stops on destroy', async () => {
    const element = root();
    marker().append(element);
    let allowed = true;
    const { io, events, tracking } = setup(false, () => allowed);
    io.trigger(element, true);
    await vi.advanceTimersByTimeAsync(600);
    allowed = false;
    tracking.syncConsent();
    await vi.advanceTimersByTimeAsync(600);
    expect(events.trackView).not.toHaveBeenCalled();
    allowed = true;
    tracking.syncConsent();
    io.trigger(element, true);
    await vi.advanceTimersByTimeAsync(600);
    tracking.reset();
    tracking.syncConsent();
    io.trigger(element, true);
    await vi.advanceTimersByTimeAsync(600);
    expect(events.trackView).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(events.trackView).toHaveBeenCalledOnce();
    tracking.destroy();
    element.setAttribute('data-ctfl-scopes', 'page');
    await vi.advanceTimersByTimeAsync(0);
    io.trigger(element, true);
    await vi.advanceTimersByTimeAsync(1200);
    expect(events.trackView).toHaveBeenCalledOnce();
  });
});

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { createInteractionTracking } from './interaction-tracking.js';
import { deferred, installIOPolyfill } from './test-fixtures/dom.js';
import { getTrackingAttributes, TRACKING_SCOPES_ATTRIBUTE } from './tracking-attributes.js';

import type { TrackingAttribution } from './tracking/attribution.js';

const EXPERIENCE: TrackingAttribution = { entityId: 'landing', entityKind: 'Experience' };
const FRAGMENT: TrackingAttribution = {
  entityId: 'hero',
  entityKind: 'ExperienceFragment',
  parentExperienceId: 'landing',
  parentVariantId: 'root-variant',
};

const ATTRIBUTIONS: Record<string, TrackingAttribution> = {
  'node-experience': EXPERIENCE,
  'node-fragment': FRAGMENT,
};

function setAttributions(
  element: Element,
  attributions: Record<string, TrackingAttribution>
): void {
  const scopes = Object.fromEntries(
    Object.entries(attributions).map(([key, attribution]) => [key, { key, ...attribution }])
  );
  for (const [name, value] of Object.entries(getTrackingAttributes({ scopes }))) {
    element.setAttribute(name, value);
  }
}

beforeEach(() => setAttributions(document.body, ATTRIBUTIONS));

function createEvents() {
  return {
    trackView: vi.fn().mockResolvedValue(true),
    trackHover: vi.fn().mockResolvedValue(true),
    trackClick: vi.fn().mockResolvedValue(true),
  };
}

/** A stamped element. Defaults to a `<button>` so clicks on it count as interactive. */
function stamped(nodeId: string, tag = 'button'): HTMLElement {
  const element = document.createElement(tag);
  element.setAttribute(TRACKING_SCOPES_ATTRIBUTE, nodeId);
  return element;
}

const click = (element: Element): void => {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};

// Lets MutationObserver callbacks (microtasks) run.
const flushMutations = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  document.body.removeAttribute('data-ctfl-attribution');
});

describe('createInteractionTracking', () => {
  it('tracks elements already in the DOM, resolving attribution from the stamped node id', () => {
    const fragment = stamped('node-fragment');
    document.body.append(fragment);
    const events = createEvents();

    const tracking = createInteractionTracking(events);
    click(fragment);

    expect(events.trackClick).toHaveBeenCalledTimes(1);
    expect(events.trackClick.mock.calls[0]![0]).toMatchObject({
      entityId: 'hero',
      entityKind: 'ExperienceFragment',
      parentExperienceId: 'landing',
      parentVariantId: 'root-variant',
    });
    tracking.destroy();
  });

  it('discovers elements added after it starts', async () => {
    const events = createEvents();
    const tracking = createInteractionTracking(events);

    const wrapper = document.createElement('section');
    const fragment = stamped('node-fragment');
    wrapper.append(fragment);
    document.body.append(wrapper);
    await flushMutations();
    click(fragment);

    expect(events.trackClick).toHaveBeenCalledTimes(1);
    tracking.destroy();
  });

  it('stops tracking an element once it is removed from the DOM', async () => {
    const fragment = stamped('node-fragment');
    document.body.append(fragment);
    const events = createEvents();
    const tracking = createInteractionTracking(events);

    fragment.remove();
    await flushMutations();
    click(fragment);

    expect(events.trackClick).not.toHaveBeenCalled();
    tracking.destroy();
  });

  it('follows changes to the stamped attribute', async () => {
    const element = stamped('unknown');
    document.body.append(element);
    const events = createEvents();
    const tracking = createInteractionTracking(events);

    click(element);
    element.setAttribute(TRACKING_SCOPES_ATTRIBUTE, 'node-fragment');
    await flushMutations();
    click(element);
    element.removeAttribute(TRACKING_SCOPES_ATTRIBUTE);
    await flushMutations();
    click(element);

    expect(events.trackClick).toHaveBeenCalledTimes(1);
    tracking.destroy();
  });

  it('leaves an element with no resolvable attribution unobserved', () => {
    const element = stamped('not-in-the-lookup');
    document.body.append(element);
    const events = createEvents();
    const tracking = createInteractionTracking(events);

    click(element);

    expect(events.trackClick).not.toHaveBeenCalled();
    tracking.destroy();
  });

  it('never sends clicks for an Experience', () => {
    const experience = stamped('node-experience');
    document.body.append(experience);
    const events = createEvents();
    const tracking = createInteractionTracking(events);

    click(experience);

    expect(events.trackClick).not.toHaveBeenCalled();
    tracking.destroy();
  });

  it('attributes a click inside a Fragment nested in an Experience to the Fragment', () => {
    const experience = stamped('node-experience', 'div');
    const fragment = stamped('node-fragment', 'div');
    const button = document.createElement('button');
    fragment.append(button);
    experience.append(fragment);
    document.body.append(experience);
    const events = createEvents();
    const tracking = createInteractionTracking(events);

    click(button);

    expect(events.trackClick).toHaveBeenCalledTimes(1);
    expect(events.trackClick.mock.calls[0]![0].entityId).toBe('hero');
    tracking.destroy();
  });

  it('only discovers scope roots with metadata on their nearest boundary', async () => {
    const container = document.createElement('main');
    const inside = stamped('node-fragment');
    const outside = stamped('node-fragment');
    container.append(inside);
    document.body.append(container, outside);
    const events = createEvents();
    document.body.removeAttribute('data-ctfl-attribution');
    setAttributions(container, ATTRIBUTIONS);
    const tracking = createInteractionTracking(events);

    click(outside);
    click(inside);

    expect(events.trackClick).toHaveBeenCalledTimes(1);
    tracking.destroy();
  });

  it('skips a disabled interaction', () => {
    const fragment = stamped('node-fragment');
    document.body.append(fragment);
    const events = createEvents();
    const tracking = createInteractionTracking(events, {
      clicks: false,
    });

    click(fragment);

    expect(events.trackClick).not.toHaveBeenCalled();
    tracking.destroy();
  });

  it('picks up metadata added around already-stamped elements', async () => {
    const fragment = stamped('node-fragment');
    document.body.append(fragment);
    const events = createEvents();
    document.body.removeAttribute('data-ctfl-attribution');
    const tracking = createInteractionTracking(events);

    click(fragment);
    setAttributions(document.body, ATTRIBUTIONS);
    await flushMutations();
    click(fragment);

    expect(events.trackClick).toHaveBeenCalledTimes(1);
    tracking.destroy();
  });

  it('stops all tracking and discovery on destroy', async () => {
    const fragment = stamped('node-fragment');
    document.body.append(fragment);
    const events = createEvents();
    const tracking = createInteractionTracking(events);

    tracking.destroy();
    click(fragment);
    const added = stamped('node-fragment');
    document.body.append(added);
    await flushMutations();
    click(added);

    expect(events.trackClick).not.toHaveBeenCalled();
  });

  it('ignores clicks on non-interactive content inside a Fragment', () => {
    const fragment = stamped('node-fragment', 'div');
    const text = document.createElement('p');
    fragment.append(text);
    document.body.append(fragment);
    const events = createEvents();
    const tracking = createInteractionTracking(events);

    click(text);

    expect(events.trackClick).not.toHaveBeenCalled();
    tracking.destroy();
  });

  it('sends an Experience view when it qualifies and its final duration on endActive', async () => {
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    const io = installIOPolyfill();
    const experience = stamped('node-experience', 'main');
    document.body.append(experience);
    const events = createEvents();
    const tracking = createInteractionTracking(events);

    io.getLast().trigger(experience, true);
    await vi.advanceTimersByTimeAsync(1600);
    await tracking.endActive();

    expect(events.trackView).toHaveBeenCalledTimes(2);
    const [first, final] = events.trackView.mock.calls.map(([args]) => args);
    expect(first).toMatchObject({ entityId: 'landing', entityKind: 'Experience' });
    expect(final).toMatchObject({ viewId: first.viewId, viewDurationMs: 1600 });
    tracking.destroy();
  });

  it.each(['Unknown'])('never tracks a node whose attribution is a %s', async (entityKind) => {
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    const io = installIOPolyfill();
    const element = stamped('node-inline');
    document.body.append(element);
    const events = createEvents();
    // Metadata can be malformed or originate outside the SDK.
    document.body.setAttribute(
      'data-ctfl-attribution',
      JSON.stringify({
        scopes: { 'node-inline': { entityId: 'inline', entityKind } },
      })
    );
    const tracking = createInteractionTracking(events);

    // Nothing resolvable to track, so no observer is created for it at all.
    expect(() => io.getLast()).toThrow();
    element.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
    click(element);
    await vi.advanceTimersByTimeAsync(1500);
    await tracking.endActive();

    expect(events.trackView).not.toHaveBeenCalled();
    expect(events.trackHover).not.toHaveBeenCalled();
    expect(events.trackClick).not.toHaveBeenCalled();
    tracking.destroy();
  });

  it('ends in-progress views synchronously in endActive, so destroy right after still sends them', async () => {
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    const io = installIOPolyfill();
    const experience = stamped('node-experience', 'main');
    document.body.append(experience);
    const events = createEvents();
    const tracking = createInteractionTracking(events);

    io.getLast().trigger(experience, true);
    await vi.advanceTimersByTimeAsync(1300);
    const flushed = tracking.endActive();
    tracking.destroy();
    await flushed;

    expect(events.trackView.mock.calls.map(([args]) => args.viewDurationMs)).toEqual([1000, 1300]);
  });

  describe('when an element starts naming a different entity', () => {
    const setup = () => {
      vi.useFakeTimers();
      vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
      const io = installIOPolyfill();
      const element = stamped('node-a', 'main');
      document.body.append(element);
      const events = createEvents();
      const attributions: Record<string, TrackingAttribution> = {
        'node-a': { entityId: 'a', entityKind: 'Experience' },
        'node-b': { entityId: 'b', entityKind: 'Experience' },
      };
      setAttributions(document.body, attributions);
      const tracking = createInteractionTracking(events);
      return { io, element, events, attributions, tracking };
    };

    const viewsBy = (trackView: ReturnType<typeof vi.fn>) =>
      trackView.mock.calls.map(([args]) => `${args.entityId}:${args.viewId}`);

    it('finalizes the old view and starts a fresh view when its scope key changes', async () => {
      const { io, element, events, tracking } = setup();

      io.getLast().trigger(element, true);
      await vi.advanceTimersByTimeAsync(1000);
      element.setAttribute(TRACKING_SCOPES_ATTRIBUTE, 'node-b');
      await vi.advanceTimersByTimeAsync(0);
      io.getLast().trigger(element, true);
      await vi.advanceTimersByTimeAsync(1000);

      const [first, final, second] = events.trackView.mock.calls.map(([args]) => args);
      expect(events.trackView).toHaveBeenCalledTimes(3);
      expect(final).toMatchObject({ entityId: first.entityId, viewId: first.viewId });
      expect(first).toMatchObject({ entityId: 'a' });
      expect(second).toMatchObject({ entityId: 'b' });
      expect(second.viewId).not.toBe(first.viewId);
      // No view id is ever reported under two entities.
      expect(new Set(viewsBy(events.trackView).map((v) => v.split(':')[1])).size).toBe(2);
      tracking.destroy();
    });

    it('starts a fresh view when its boundary metadata names a different entity', async () => {
      const { io, element, events, attributions, tracking } = setup();

      io.getLast().trigger(element, true);
      await vi.advanceTimersByTimeAsync(1000);
      attributions['node-a'] = { entityId: 'a2', entityKind: 'Experience' };
      setAttributions(document.body, attributions);
      await vi.advanceTimersByTimeAsync(0);
      io.getLast().trigger(element, true);
      await vi.advanceTimersByTimeAsync(1000);
      await tracking.endActive();

      const reported = events.trackView.mock.calls.map(([args]) => args);
      const byViewId = new Map<string, Set<string>>();
      for (const args of reported) {
        byViewId.set(args.viewId, (byViewId.get(args.viewId) ?? new Set()).add(args.entityId));
      }
      expect([...byViewId.values()].every((entities) => entities.size === 1)).toBe(true);
      expect(reported.map((args) => args.entityId)).toContain('a2');
      tracking.destroy();
    });

    it('keeps an in-progress view when its boundary metadata is unchanged', async () => {
      const { io, element, events, attributions, tracking } = setup();

      io.getLast().trigger(element, true);
      await vi.advanceTimersByTimeAsync(600);
      attributions['node-a'] = { entityId: 'a', entityKind: 'Experience' };
      setAttributions(document.body, attributions);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(600);

      expect(events.trackView).toHaveBeenCalledOnce();
      tracking.destroy();
    });
  });
});

describe('createInteractionTracking — control transitions', () => {
  const enter = (element: Element): void => {
    element.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
  };
  const leave = (element: Element): void => {
    element.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
  };
  const setup = () => {
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    const io = installIOPolyfill();
    const element = stamped('node-fragment');
    document.body.append(element);
    const events = createEvents();
    const coordinator = createInteractionTracking(events);
    onTestFinished(() => coordinator.destroy());
    return { io, element, events, coordinator };
  };

  it.each([
    ['0px', '0px 0px 0px 0px'],
    ['10px', '10px 10px 10px 10px'],
    ['10px 20px', '10px 20px 10px 20px'],
    ['10px 20px 30px', '10px 20px 30px 20px'],
  ])('keeps view and hover timers when %s is enabled again as %s', async (initial, equivalent) => {
    const { io, element, events, coordinator } = setup();
    coordinator.tracking.enable('views', { rootMargin: initial });
    io.trigger(element, true);
    enter(element);
    await vi.advanceTimersByTimeAsync(600);
    coordinator.tracking.enable('views', { root: null, rootMargin: equivalent });
    coordinator.tracking.enable('hovers');
    await vi.advanceTimersByTimeAsync(500);

    expect(events.trackView).toHaveBeenCalledOnce();
    expect(events.trackHover).toHaveBeenCalledOnce();
    await coordinator.endActive();
    for (const [method, id, duration] of [
      [events.trackView, 'viewId', 'viewDurationMs'],
      [events.trackHover, 'hoverId', 'hoverDurationMs'],
    ] as const) {
      const [first, final] = method.mock.calls.map(([args]) => args);
      expect(method).toHaveBeenCalledTimes(2);
      expect(final[id]).toBe(first[id]);
      expect(final[duration]).toBe(1100);
    }
    coordinator.destroy();
  });

  it('preserves pending final durations when the already-enabled type is enabled again', async () => {
    const { io, element, events, coordinator } = setup();
    const pending = deferred<boolean>();
    events.trackView.mockReturnValueOnce(pending.promise);
    events.trackHover.mockReturnValueOnce(pending.promise);
    io.trigger(element, true);
    enter(element);
    await vi.advanceTimersByTimeAsync(1400);
    io.trigger(element, false);
    leave(element);
    await vi.advanceTimersByTimeAsync(0);
    coordinator.tracking.enable('views');
    coordinator.tracking.enable('hovers');
    pending.resolve(true);
    await vi.advanceTimersByTimeAsync(0);

    for (const [method, id, duration] of [
      [events.trackView, 'viewId', 'viewDurationMs'],
      [events.trackHover, 'hoverId', 'hoverDurationMs'],
    ] as const) {
      const [first, final] = method.mock.calls.map(([args]) => args);
      expect(method).toHaveBeenCalledTimes(2);
      expect(final[id]).toBe(first[id]);
      expect(final[duration]).toBe(1400);
    }
    coordinator.destroy();
  });

  it.each(['root', 'rootMargin'] as const)(
    'starts a new view interval when the effective %s changes',
    async (option) => {
      const { io, element, events, coordinator } = setup();
      io.trigger(element, true);
      await vi.advanceTimersByTimeAsync(1200);
      const first = events.trackView.mock.calls[0]![0];
      const root = document.createElement('section');
      document.body.append(root);
      coordinator.tracking.enable('views', option === 'root' ? { root } : { rootMargin: '10px' });
      io.trigger(element, true);
      await vi.advanceTimersByTimeAsync(600);
      expect(events.trackView).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(600);
      expect(events.trackView).toHaveBeenCalledTimes(2);
      expect(events.trackView.mock.calls[1]![0].viewId).not.toBe(first.viewId);
      await coordinator.endActive();
      expect(events.trackView.mock.calls[2]![0].viewDurationMs).toBe(1200);
      coordinator.destroy();
    }
  );

  it.each(['views', 'hovers', 'clicks'] as const)(
    'discovers existing, inserted and changed DOM opt-ins while automatic %s are disabled',
    async (type) => {
      vi.useFakeTimers();
      const io = installIOPolyfill();
      const events = createEvents();
      const existing = stamped('existing');
      existing.setAttribute(`data-ctfl-track-${type}`, 'true');
      document.body.append(existing);
      const changed = stamped('changed');
      const inserted = stamped('inserted');
      setAttributions(document.body, { existing: FRAGMENT, inserted: FRAGMENT, changed: FRAGMENT });
      const coordinator = createInteractionTracking(events, {
        views: false,
        hovers: false,
        clicks: false,
      });
      onTestFinished(() => coordinator.destroy());
      const interact = async (element: Element) => {
        io.trigger(element, true);
        enter(element);
        click(element);
        await vi.advanceTimersByTimeAsync(1000);
      };
      await interact(existing);
      inserted.setAttribute(`data-ctfl-track-${type}`, 'true');
      document.body.append(inserted, changed);
      await vi.advanceTimersByTimeAsync(0);
      await interact(inserted);
      changed.setAttribute(`data-ctfl-track-${type}`, 'true');
      await vi.advanceTimersByTimeAsync(0);
      await interact(changed);

      const method =
        type === 'views'
          ? events.trackView
          : type === 'hovers'
            ? events.trackHover
            : events.trackClick;
      expect(method).toHaveBeenCalledTimes(3);
      if (type !== 'clicks') {
        coordinator.tracking.disableElement(type, existing);
        coordinator.tracking.disableElement(type, inserted);
        coordinator.tracking.disableElement(type, changed);
      }
      coordinator.destroy();
    }
  );

  it('applies explicit enable/disable before DOM opt-ins and still respects consent', async () => {
    const element = stamped('node-fragment');
    element.setAttribute('data-ctfl-track-clicks', 'false');
    document.body.append(element);
    const events = createEvents();
    installIOPolyfill();
    let allowed = true;
    const coordinator = createInteractionTracking(events, {}, { isAllowed: () => allowed });
    onTestFinished(() => coordinator.destroy());
    click(element);
    expect(events.trackClick).not.toHaveBeenCalled();
    coordinator.tracking.enableElement('clicks', element);
    click(element);
    expect(events.trackClick).toHaveBeenCalledOnce();
    element.setAttribute('data-ctfl-track-clicks', 'true');
    coordinator.tracking.disableElement('clicks', element);
    await flushMutations();
    click(element);
    expect(events.trackClick).toHaveBeenCalledOnce();
    coordinator.tracking.clearElement('clicks', element);
    click(element);
    expect(events.trackClick).toHaveBeenCalledTimes(2);
    allowed = false;
    coordinator.syncConsent();
    coordinator.tracking.enableElement('clicks', element);
    click(element);
    expect(events.trackClick).toHaveBeenCalledTimes(2);
    allowed = true;
    coordinator.syncConsent();
    click(element);
    expect(events.trackClick).toHaveBeenCalledTimes(3);
    coordinator.destroy();
  });

  it('discovers manual descendants on subtree attachment and removal without scanning overrides for unrelated roots', async () => {
    const io = installIOPolyfill();
    const events = createEvents();
    const coordinator = createInteractionTracking(events, {
      views: false,
      hovers: false,
      clicks: false,
    });
    onTestFinished(() => coordinator.destroy());
    const wrapper = document.createElement('section');
    const manual = document.createElement('button');
    wrapper.append(manual);
    coordinator.tracking.enableElement('clicks', manual, { data: FRAGMENT });
    coordinator.tracking.enableElement('views', manual, { data: FRAGMENT });
    document.body.append(wrapper);
    await flushMutations();
    click(manual);
    expect(events.trackClick).toHaveBeenCalledOnce();
    const observer = io.getLast();
    expect(observer.observed.has(manual)).toBe(true);

    const unrelated = document.createElement('section');
    const contains = vi.spyOn(unrelated, 'contains');
    document.body.append(unrelated);
    await flushMutations();
    unrelated.remove();
    await flushMutations();
    expect(contains).not.toHaveBeenCalledWith(manual);

    wrapper.remove();
    await flushMutations();
    expect(observer.observed.has(manual)).toBe(false);
    click(manual);
    expect(events.trackClick).toHaveBeenCalledOnce();
    document.body.append(wrapper);
    await flushMutations();
    click(manual);
    expect(events.trackClick).toHaveBeenCalledTimes(2);
    expect(io.getLast().observed.has(manual)).toBe(true);
    coordinator.destroy();
  });
});

describe('createInteractionTracking — scope occurrences', () => {
  const HERO: TrackingAttribution = { entityId: 'hero', entityKind: 'ExperienceFragment' };
  const PAGE: TrackingAttribution = { entityId: 'landing', entityKind: 'Experience' };

  /** An element listing several occurrence keys, as `data-ctfl-scopes` does. */
  const rooting = (keys: string, tag = 'div'): HTMLElement => stamped(keys, tag);

  async function setup(attributions: Record<string, TrackingAttribution>) {
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    const io = installIOPolyfill();
    const events = createEvents();
    setAttributions(document.body, attributions);
    const tracking = createInteractionTracking(events);
    return { io, events, tracking };
  }

  it('passes root variant attribution to views, hovers and clicks', async () => {
    const fragment = stamped('node-fragment');
    document.body.append(fragment);
    const { io, events, tracking } = await setup(ATTRIBUTIONS);

    io.trigger(fragment, true);
    fragment.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
    await vi.advanceTimersByTimeAsync(1200);
    click(fragment);
    await tracking.endActive();

    for (const method of [events.trackView, events.trackHover, events.trackClick]) {
      expect(method).toHaveBeenCalled();
      for (const [args] of method.mock.calls) {
        expect(args).toMatchObject({
          entityId: 'hero',
          parentExperienceId: 'landing',
          parentVariantId: 'root-variant',
        });
      }
    }
    tracking.destroy();
  });

  it('reports a Fragment with two root elements as one view', async () => {
    const first = rooting('hero-1');
    const second = rooting('hero-1');
    document.body.append(first, second);
    const { io, events, tracking } = await setup({ 'hero-1': HERO });

    io.trigger(first, true);
    io.trigger(second, true);
    await vi.advanceTimersByTimeAsync(1200);
    io.trigger(first, false);
    io.trigger(second, false);
    await vi.advanceTimersByTimeAsync(0);

    expect(events.trackView).toHaveBeenCalledTimes(2);
    const [start, end] = events.trackView.mock.calls.map(([args]) => args);
    expect(end.viewId).toBe(start.viewId);
    tracking.destroy();
  });

  it('keeps the view open while any root element has a visible pixel', async () => {
    const first = rooting('hero-1');
    const second = rooting('hero-1');
    document.body.append(first, second);
    const { io, events, tracking } = await setup({ 'hero-1': HERO });

    io.trigger(first, true);
    await vi.advanceTimersByTimeAsync(1000);
    io.trigger(second, true);
    io.trigger(first, false);
    await vi.advanceTimersByTimeAsync(500);

    expect(events.trackView).toHaveBeenCalledTimes(1); // only the start: still in view
    io.trigger(second, false);
    await vi.advanceTimersByTimeAsync(0);
    expect(events.trackView).toHaveBeenCalledTimes(2);
    tracking.destroy();
  });

  it('reports two occurrences of the same Fragment as two separate views', async () => {
    const left = rooting('hero-1');
    const right = rooting('hero-2');
    document.body.append(left, right);
    const { io, events, tracking } = await setup({ 'hero-1': HERO, 'hero-2': HERO });

    io.trigger(left, true);
    io.trigger(right, true);
    await vi.advanceTimersByTimeAsync(1000);

    expect(events.trackView).toHaveBeenCalledTimes(2);
    const ids = events.trackView.mock.calls.map(([args]) => args.viewId);
    expect(new Set(ids).size).toBe(2);
    tracking.destroy();
  });

  it('reports an element in an Experience and a Fragment to both, by kind', async () => {
    const element = rooting('page hero-1', 'button');
    document.body.append(element);
    const { io, events, tracking } = await setup({ page: PAGE, 'hero-1': HERO });

    io.trigger(element, true);
    element.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
    await vi.advanceTimersByTimeAsync(1000);
    click(element);

    // Views: both scopes. Hovers and clicks: the Fragment only.
    const viewed = events.trackView.mock.calls.map(([args]) => args.entityKind).sort();
    expect(viewed).toEqual(['Experience', 'ExperienceFragment']);
    expect(events.trackHover).toHaveBeenCalledTimes(1);
    expect(events.trackHover.mock.calls[0]![0].entityKind).toBe('ExperienceFragment');
    expect(events.trackClick).toHaveBeenCalledTimes(1);
    expect(events.trackClick.mock.calls[0]![0].entityKind).toBe('ExperienceFragment');
    tracking.destroy();
  });

  it('keeps a hover going while the pointer moves between a Fragment’s root elements', async () => {
    const first = rooting('hero-1');
    const second = rooting('hero-1');
    document.body.append(first, second);
    const { events, tracking } = await setup({ 'hero-1': HERO });
    const enter = (el: Element) =>
      el.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
    const leave = (el: Element) =>
      el.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));

    enter(first);
    await vi.advanceTimersByTimeAsync(600);
    enter(second);
    leave(first);
    await vi.advanceTimersByTimeAsync(600);
    leave(second);
    await vi.advanceTimersByTimeAsync(0);

    expect(events.trackHover).toHaveBeenCalledTimes(2);
    const [start, end] = events.trackHover.mock.calls.map(([args]) => args);
    expect(end.hoverId).toBe(start.hoverId);
    tracking.destroy();
  });

  it('sends a click to the innermost Fragment the nearest tracked element roots', async () => {
    const outer = rooting('outer', 'section');
    const inner = rooting('inner', 'div');
    const button = document.createElement('button');
    inner.append(button);
    outer.append(inner);
    document.body.append(outer);
    const { events, tracking } = await setup({
      outer: { ...HERO, entityId: 'outer' },
      inner: { ...HERO, entityId: 'inner' },
    });

    click(button);

    expect(events.trackClick).toHaveBeenCalledTimes(1);
    expect(events.trackClick.mock.calls[0]![0].entityId).toBe('inner');
    tracking.destroy();
  });

  it('keeps sending clicks to the innermost Fragment after boundary metadata re-points an outer key', async () => {
    const element = rooting('outer inner', 'button');
    document.body.append(element);
    const attributions: Record<string, TrackingAttribution> = {
      outer: { ...HERO, entityId: 'outer' },
      inner: { ...HERO, entityId: 'inner' },
    };
    const { events, tracking } = await setup(attributions);

    attributions.outer = { ...HERO, entityId: 'outer-b' };
    setAttributions(document.body, attributions);
    await vi.advanceTimersByTimeAsync(0);
    click(element);

    expect(events.trackClick).toHaveBeenCalledTimes(1);
    expect(events.trackClick.mock.calls[0]![0].entityId).toBe('inner');
    tracking.destroy();
  });

  it('starts a fresh view for every scope when its boundary metadata changes', async () => {
    const element = rooting('page hero-1');
    document.body.append(element);
    const attributions: Record<string, TrackingAttribution> = { page: PAGE, 'hero-1': HERO };
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    const io = installIOPolyfill();
    const events = createEvents();
    setAttributions(document.body, attributions);
    const tracking = createInteractionTracking(events);

    io.trigger(element, true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(events.trackView).toHaveBeenCalledTimes(2);
    const before = events.trackView.mock.calls.map(([args]) => args);

    attributions['hero-1'] = { ...HERO, entityId: 'hero-b' };
    setAttributions(document.body, attributions);
    await vi.advanceTimersByTimeAsync(0);
    io.trigger(element, true);
    await vi.advanceTimersByTimeAsync(1000);

    const after = events.trackView.mock.calls.slice(2).map(([args]) => args);
    expect(after.some((args) => args.entityId === 'hero-b')).toBe(true);
    // Replacing metadata retires every occurrence in that boundary.
    const pageViewIds = [...before, ...after]
      .filter((args) => args.entityId === 'landing')
      .map((args) => args.viewId);
    expect(new Set(pageViewIds).size).toBe(2);
    tracking.destroy();
  });

  it.each(['view', 'hover'] as const)(
    'starts a fresh %s when only the root Experience variant changes',
    async (kind) => {
      const element = rooting('hero-1');
      document.body.append(element);
      const ownVariant = 'fragment-variant';
      const attributions: Record<string, TrackingAttribution> = {
        'hero-1': {
          ...HERO,
          variantId: ownVariant,
          parentExperienceId: 'landing',
          parentVariantId: 'default',
        },
      };
      const { io, events, tracking } = await setup(attributions);
      const trigger = () =>
        kind === 'view'
          ? io.trigger(element, true)
          : element.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
      const method = kind === 'view' ? events.trackView : events.trackHover;
      const idField = kind === 'view' ? 'viewId' : 'hoverId';

      trigger();
      await vi.advanceTimersByTimeAsync(1200);
      attributions['hero-1'] = { ...attributions['hero-1']!, parentVariantId: 'root-b' };
      setAttributions(document.body, attributions);
      await vi.advanceTimersByTimeAsync(0);
      trigger();
      await vi.advanceTimersByTimeAsync(1200);

      const args = method.mock.calls.map(([args]) => args);
      expect(args).toHaveLength(3);
      expect(args[1]).toMatchObject({ [idField]: args[0][idField], parentVariantId: 'default' });
      expect(args[0]).toMatchObject({
        variantId: ownVariant,
        parentVariantId: 'default',
      });
      expect(args[2]).toMatchObject({ variantId: ownVariant, parentVariantId: 'root-b' });
      expect(args[2][idField]).not.toBe(args[0][idField]);
      tracking.destroy();
    }
  );

  it('stops reporting a key once the attribute no longer lists it', async () => {
    const element = rooting('page hero-1');
    document.body.append(element);
    const { io, events, tracking } = await setup({ page: PAGE, 'hero-1': HERO });

    element.setAttribute(TRACKING_SCOPES_ATTRIBUTE, 'page');
    await vi.advanceTimersByTimeAsync(0);
    io.trigger(element, true);
    await vi.advanceTimersByTimeAsync(1000);

    expect(events.trackView.mock.calls.map(([args]) => args.entityKind)).toEqual(['Experience']);
    tracking.destroy();
  });
});

describe('automatic attribution boundaries', () => {
  it('keeps repeated containers independent while grouping sibling roots within each', async () => {
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    const io = installIOPolyfill();
    const events = createEvents();
    const roots: HTMLElement[] = [];
    for (let index = 0; index < 2; index++) {
      const boundary = document.createElement('section');
      setAttributions(boundary, ATTRIBUTIONS);
      const first = stamped('node-fragment');
      const second = stamped('node-fragment');
      roots.push(first, second);
      boundary.append(first, second);
      document.body.append(boundary);
    }
    const tracking = createInteractionTracking(events);
    roots.forEach((element) => io.trigger(element, true));
    await vi.advanceTimersByTimeAsync(1200);
    expect(events.trackView).toHaveBeenCalledTimes(2);
    expect(new Set(events.trackView.mock.calls.map(([args]) => args.viewId)).size).toBe(2);
    await tracking.endActive();
    expect(events.trackView).toHaveBeenCalledTimes(4);
    tracking.destroy();
  });

  it.each([
    '{',
    'null',
    '[]',
    '{}',
    '{"scopes":[]}',
    '{"scopes":{"node-fragment":{"entityId":12,"entityKind":"ExperienceFragment"}}}',
    '{"scopes":{"node-fragment":{"entityId":"hero","entityKind":"ExperienceFragment","entryIds":[42]}}}',
  ])(
    'ignores malformed nearest metadata without falling through to outer attribution: %s',
    (raw) => {
      const boundary = document.createElement('section');
      boundary.setAttribute('data-ctfl-attribution', raw);
      const fragment = stamped('node-fragment');
      boundary.append(fragment);
      document.body.append(boundary);
      const events = createEvents();
      const tracking = createInteractionTracking(events);
      expect(() => click(fragment)).not.toThrow();
      expect(events.trackClick).not.toHaveBeenCalled();
      tracking.destroy();
    }
  );

  it('uses the nearest boundary and discovers valid replacement metadata', async () => {
    const boundary = document.createElement('section');
    setAttributions(boundary, { 'node-fragment': { ...FRAGMENT, entityId: 'inner' } });
    const fragment = stamped('node-fragment');
    boundary.append(fragment);
    document.body.append(boundary);
    const events = createEvents();
    const tracking = createInteractionTracking(events);
    click(fragment);
    boundary.setAttribute('data-ctfl-attribution', '{');
    await flushMutations();
    click(fragment);
    setAttributions(boundary, { 'node-fragment': { ...FRAGMENT, entityId: 'replacement' } });
    await flushMutations();
    click(fragment);
    expect(events.trackClick.mock.calls.map(([args]) => args.entityId)).toEqual([
      'inner',
      'replacement',
    ]);
    tracking.destroy();
  });

  it('awaits a removed group drain and keeps a reinserted occurrence independent', async () => {
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    const io = installIOPolyfill();
    const firstSend = deferred<boolean>();
    const events = createEvents();
    events.trackView.mockImplementationOnce(() => firstSend.promise);
    const fragment = stamped('node-fragment');
    document.body.append(fragment);
    const tracking = createInteractionTracking(events);
    io.trigger(fragment, true);
    await vi.advanceTimersByTimeAsync(1200);
    fragment.remove();
    await vi.advanceTimersByTimeAsync(0);
    let drained = false;
    const pending = tracking.endActive().then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);
    document.body.append(fragment);
    await vi.advanceTimersByTimeAsync(0);
    io.trigger(fragment, true);
    await vi.advanceTimersByTimeAsync(1000);
    firstSend.resolve(true);
    await pending;
    const [oldStart, newStart, oldFinal] = events.trackView.mock.calls.map(([args]) => args);
    expect(events.trackView).toHaveBeenCalledTimes(3);
    expect(oldFinal).toMatchObject({ viewId: oldStart.viewId, viewDurationMs: 1200 });
    expect(newStart.viewId).not.toBe(oldStart.viewId);
    tracking.destroy();
  });

  it.each([
    { type: 'views', action: 'reset', behavior: 'discards' },
    { type: 'hovers', action: 'reset', behavior: 'discards' },
    { type: 'views', action: 'disable', behavior: 'preserves' },
    { type: 'hovers', action: 'disable', behavior: 'preserves' },
  ] as const)(
    '$behavior a retired $type drain on $action before restarting',
    async ({ type, action }) => {
      vi.useFakeTimers();
      vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
      const io = installIOPolyfill();
      const firstSend = deferred<boolean>();
      const events = createEvents();
      const method = type === 'views' ? events.trackView : events.trackHover;
      method.mockImplementationOnce(() => firstSend.promise);
      let resetToken = {};
      const fragment = stamped('node-fragment');
      document.body.append(fragment);
      const tracking = createInteractionTracking(
        events,
        {},
        {
          isAllowed: () => true,
          getResetToken: () => resetToken,
        }
      );
      if (type === 'views') io.trigger(fragment, true);
      else fragment.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
      await vi.advanceTimersByTimeAsync(1200);
      fragment.remove();
      await vi.advanceTimersByTimeAsync(0);
      if (action === 'reset') {
        resetToken = {};
        tracking.reset();
        tracking.syncConsent();
      } else {
        tracking.tracking.disable(type);
        tracking.tracking.enable(type);
      }
      let drained = false;
      const pending = tracking.endActive().then(() => {
        drained = true;
      });
      try {
        await vi.advanceTimersByTimeAsync(0);
        // Removal already captured the final interval. Changing automatic discovery
        // keeps that drain; reset invalidates its previous visitor's callbacks.
        expect(drained).toBe(action === 'reset');
      } finally {
        firstSend.resolve(true);
        await vi.advanceTimersByTimeAsync(0);
        await pending;
        tracking.destroy();
      }
      if (action === 'reset') {
        expect(method).toHaveBeenCalledOnce();
      } else {
        expect(method).toHaveBeenCalledTimes(2);
        const [start, final] = method.mock.calls.map(([args]) => args);
        const id = type === 'views' ? 'viewId' : 'hoverId';
        const duration = type === 'views' ? 'viewDurationMs' : 'hoverDurationMs';
        expect(final[id]).toBe(start[id]);
        expect(final[duration]).toBe(1200);
      }
    }
  );
});

// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createInteractionTracking } from './interaction-tracking.js';
import { installIOPolyfill } from './test-fixtures/dom.js';
import { TRACKING_SCOPES_ATTRIBUTE } from './tracking-attributes.js';

import type { TrackingAttribution } from './tracking/attribution.js';

const EXPERIENCE: TrackingAttribution = { entityId: 'landing', entityKind: 'Experience' };
const FRAGMENT: TrackingAttribution = {
  entityId: 'hero',
  entityKind: 'Fragment',
  parentExperienceId: 'landing',
};

const ATTRIBUTIONS: Record<string, TrackingAttribution> = {
  'node-experience': EXPERIENCE,
  'node-fragment': FRAGMENT,
};

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
});

describe('createInteractionTracking', () => {
  it('tracks elements already in the DOM, resolving attribution from the stamped node id', () => {
    const fragment = stamped('node-fragment');
    document.body.append(fragment);
    const events = createEvents();

    const tracking = createInteractionTracking(events, {
      resolveAttribution: (nodeId) => ATTRIBUTIONS[nodeId],
    });
    click(fragment);

    expect(events.trackClick).toHaveBeenCalledTimes(1);
    expect(events.trackClick.mock.calls[0]![0]).toMatchObject({
      entityId: 'hero',
      entityKind: 'Fragment',
      parentExperienceId: 'landing',
    });
    tracking.destroy();
  });

  it('discovers elements added after it starts', async () => {
    const events = createEvents();
    const tracking = createInteractionTracking(events, {
      resolveAttribution: (nodeId) => ATTRIBUTIONS[nodeId],
    });

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
    const tracking = createInteractionTracking(events, {
      resolveAttribution: (nodeId) => ATTRIBUTIONS[nodeId],
    });

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
    const tracking = createInteractionTracking(events, {
      resolveAttribution: (nodeId) => ATTRIBUTIONS[nodeId],
    });

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
    const tracking = createInteractionTracking(events, {
      resolveAttribution: (nodeId) => ATTRIBUTIONS[nodeId],
    });

    click(element);

    expect(events.trackClick).not.toHaveBeenCalled();
    tracking.destroy();
  });

  it('never sends clicks for an Experience', () => {
    const experience = stamped('node-experience');
    document.body.append(experience);
    const events = createEvents();
    const tracking = createInteractionTracking(events, {
      resolveAttribution: (nodeId) => ATTRIBUTIONS[nodeId],
    });

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
    const tracking = createInteractionTracking(events, {
      resolveAttribution: (nodeId) => ATTRIBUTIONS[nodeId],
    });

    click(button);

    expect(events.trackClick).toHaveBeenCalledTimes(1);
    expect(events.trackClick.mock.calls[0]![0].entityId).toBe('hero');
    tracking.destroy();
  });

  it('only discovers elements inside the configured root', async () => {
    const container = document.createElement('main');
    const inside = stamped('node-fragment');
    const outside = stamped('node-fragment');
    container.append(inside);
    document.body.append(container, outside);
    const events = createEvents();
    const tracking = createInteractionTracking(events, {
      resolveAttribution: (nodeId) => ATTRIBUTIONS[nodeId],
      root: container,
    });

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
      resolveAttribution: (nodeId) => ATTRIBUTIONS[nodeId],
      clicks: false,
    });

    click(fragment);

    expect(events.trackClick).not.toHaveBeenCalled();
    tracking.destroy();
  });

  it('picks up attribution for already-stamped elements on refresh', () => {
    const fragment = stamped('node-fragment');
    document.body.append(fragment);
    const events = createEvents();
    let attributions: Record<string, TrackingAttribution> = {};
    const tracking = createInteractionTracking(events, {
      resolveAttribution: (nodeId) => attributions[nodeId],
    });

    click(fragment);
    attributions = ATTRIBUTIONS;
    tracking.refresh();
    click(fragment);

    expect(events.trackClick).toHaveBeenCalledTimes(1);
    tracking.destroy();
  });

  it('stops all tracking and discovery on destroy', async () => {
    const fragment = stamped('node-fragment');
    document.body.append(fragment);
    const events = createEvents();
    const tracking = createInteractionTracking(events, {
      resolveAttribution: (nodeId) => ATTRIBUTIONS[nodeId],
    });

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
    const tracking = createInteractionTracking(events, {
      resolveAttribution: (nodeId) => ATTRIBUTIONS[nodeId],
    });

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
    const tracking = createInteractionTracking(events, {
      resolveAttribution: (nodeId) => ATTRIBUTIONS[nodeId],
    });

    io.getLast().trigger(experience, true);
    await vi.advanceTimersByTimeAsync(1600);
    await tracking.endActive();

    expect(events.trackView).toHaveBeenCalledTimes(2);
    const [first, final] = events.trackView.mock.calls.map(([args]) => args);
    expect(first).toMatchObject({ entityId: 'landing', entityKind: 'Experience' });
    expect(final).toMatchObject({ viewId: first.viewId, viewDurationMs: 1600 });
    tracking.destroy();
  });

  it.each(['InlineFragment', 'InlineComponent', 'Unknown'])(
    'never tracks a node whose attribution is a %s',
    async (entityKind) => {
      vi.useFakeTimers();
      vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
      const io = installIOPolyfill();
      const element = stamped('node-inline');
      document.body.append(element);
      const events = createEvents();
      // Untyped data, e.g. a lookup built from a raw payload.
      const inline = { entityId: 'inline', entityKind } as unknown as TrackingAttribution;
      const tracking = createInteractionTracking(events, {
        resolveAttribution: (nodeId) => (nodeId === 'node-inline' ? inline : undefined),
      });

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
    }
  );

  it('rejects inline entity kinds at the type level', () => {
    // @ts-expect-error — inline nodes are not tracking targets
    const inline: TrackingAttribution = { entityId: 'x', entityKind: 'InlineComponent' };
    expect(inline).toBeDefined();
  });

  it('ends in-progress views synchronously in endActive, so destroy right after still sends them', async () => {
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    const io = installIOPolyfill();
    const experience = stamped('node-experience', 'main');
    document.body.append(experience);
    const events = createEvents();
    const tracking = createInteractionTracking(events, {
      resolveAttribution: (nodeId) => ATTRIBUTIONS[nodeId],
    });

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
      const tracking = createInteractionTracking(events, {
        resolveAttribution: (nodeId) => attributions[nodeId],
      });
      return { io, element, events, attributions, tracking };
    };

    const viewsBy = (trackView: ReturnType<typeof vi.fn>) =>
      trackView.mock.calls.map(([args]) => `${args.entityId}:${args.viewId}`);

    it('starts a fresh view when its node id changes, as the Optimization SDK does', async () => {
      const { io, element, events, tracking } = setup();

      io.getLast().trigger(element, true);
      await vi.advanceTimersByTimeAsync(1000);
      element.setAttribute(TRACKING_SCOPES_ATTRIBUTE, 'node-b');
      await vi.advanceTimersByTimeAsync(0);
      io.getLast().trigger(element, true);
      await vi.advanceTimersByTimeAsync(1000);

      const [first, second] = events.trackView.mock.calls.map(([args]) => args);
      expect(events.trackView).toHaveBeenCalledTimes(2);
      expect(first).toMatchObject({ entityId: 'a' });
      expect(second).toMatchObject({ entityId: 'b' });
      expect(second.viewId).not.toBe(first.viewId);
      // No view id is ever reported under two entities.
      expect(new Set(viewsBy(events.trackView).map((v) => v.split(':')[1])).size).toBe(2);
      tracking.destroy();
    });

    it('starts a fresh view when refresh returns a different entity for it', async () => {
      const { io, element, events, attributions, tracking } = setup();

      io.getLast().trigger(element, true);
      await vi.advanceTimersByTimeAsync(1000);
      attributions['node-a'] = { entityId: 'a2', entityKind: 'Experience' };
      tracking.refresh();
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

    it('keeps an in-progress view when refresh returns the same attribution', async () => {
      const { io, element, events, attributions, tracking } = setup();

      io.getLast().trigger(element, true);
      await vi.advanceTimersByTimeAsync(600);
      attributions['node-a'] = { entityId: 'a', entityKind: 'Experience' };
      tracking.refresh();
      await vi.advanceTimersByTimeAsync(600);

      expect(events.trackView).toHaveBeenCalledOnce();
      tracking.destroy();
    });
  });
});

describe('createInteractionTracking — scope occurrences', () => {
  const HERO: TrackingAttribution = { entityId: 'hero', entityKind: 'Fragment' };
  const PAGE: TrackingAttribution = { entityId: 'landing', entityKind: 'Experience' };

  /** An element listing several occurrence keys, as `data-ctfl-scopes` does. */
  const rooting = (keys: string, tag = 'div'): HTMLElement => stamped(keys, tag);

  async function setup(attributions: Record<string, TrackingAttribution>) {
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    const io = installIOPolyfill();
    const events = createEvents();
    const tracking = createInteractionTracking(events, {
      resolveAttribution: (key) => attributions[key],
    });
    return { io, events, tracking };
  }

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
    expect(viewed).toEqual(['Experience', 'Fragment']);
    expect(events.trackHover).toHaveBeenCalledTimes(1);
    expect(events.trackHover.mock.calls[0]![0].entityKind).toBe('Fragment');
    expect(events.trackClick).toHaveBeenCalledTimes(1);
    expect(events.trackClick.mock.calls[0]![0].entityKind).toBe('Fragment');
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

  it('keeps sending clicks to the innermost Fragment after refresh re-points an outer key', async () => {
    const element = rooting('outer inner', 'button');
    document.body.append(element);
    const attributions: Record<string, TrackingAttribution> = {
      outer: { ...HERO, entityId: 'outer' },
      inner: { ...HERO, entityId: 'inner' },
    };
    const { events, tracking } = await setup(attributions);

    attributions.outer = { ...HERO, entityId: 'outer-b' };
    tracking.refresh();
    click(element);

    expect(events.trackClick).toHaveBeenCalledTimes(1);
    expect(events.trackClick.mock.calls[0]![0].entityId).toBe('inner');
    tracking.destroy();
  });

  it('starts a fresh view for a key whose attribution changes on refresh, leaving others alone', async () => {
    const element = rooting('page hero-1');
    document.body.append(element);
    const attributions: Record<string, TrackingAttribution> = { page: PAGE, 'hero-1': HERO };
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    const io = installIOPolyfill();
    const events = createEvents();
    const tracking = createInteractionTracking(events, {
      resolveAttribution: (key) => attributions[key],
    });

    io.trigger(element, true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(events.trackView).toHaveBeenCalledTimes(2);
    const before = events.trackView.mock.calls.map(([args]) => args);

    attributions['hero-1'] = { ...HERO, entityId: 'hero-b' };
    tracking.refresh();
    io.trigger(element, true);
    await vi.advanceTimersByTimeAsync(1000);

    const after = events.trackView.mock.calls.slice(2).map(([args]) => args);
    expect(after.some((args) => args.entityId === 'hero-b')).toBe(true);
    // The Experience key was untouched, so it kept its original view.
    const pageViewIds = [...before, ...after]
      .filter((args) => args.entityId === 'landing')
      .map((args) => args.viewId);
    expect(new Set(pageViewIds).size).toBe(1);
    tracking.destroy();
  });

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

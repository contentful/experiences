// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { createInteractionTracking } from './interaction-tracking.js';
import { deferred, installIOPolyfill } from '../test/dom.js';
import { TRACKING_SCOPES_ATTRIBUTE } from '../tracking-attributes.js';

import type { TrackingAttribution } from './attribution.js';

import {
  FRAGMENT,
  ATTRIBUTIONS,
  setAttributions,
  createEvents,
  stamped,
  click,
  flushMutations,
  timedInteractions,
} from '../test/tracking-dom.js';

beforeEach(() => setAttributions(document.body, ATTRIBUTIONS));

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

  it('ends in-progress views synchronously in endActive, so destroy right after still sends them', async () => {
    const { io, events } = timedInteractions();
    const experience = stamped('node-experience', 'main');
    document.body.append(experience);
    const tracking = createInteractionTracking(events);

    io.getLast().trigger(experience, true);
    await vi.advanceTimersByTimeAsync(1300);
    const flushed = tracking.endActive();
    tracking.destroy();
    await flushed;

    expect(events.trackView.mock.calls.map(([args]) => args.viewDurationMs)).toEqual([1000, 1300]);
    expect(events.trackView.mock.calls[0]![0]).toMatchObject({
      entityId: 'landing',
      entityKind: 'Experience',
    });
    expect(events.trackView.mock.calls[1]![0].viewId).toBe(
      events.trackView.mock.calls[0]![0].viewId
    );
  });

  describe('when an element starts naming a different entity', () => {
    const setup = () => {
      const { io, events } = timedInteractions();
      const element = stamped('node-a', 'main');
      document.body.append(element);
      const attributions: Record<string, TrackingAttribution> = {
        'node-a': { entityId: 'a', entityKind: 'Experience' },
        'node-b': { entityId: 'b', entityKind: 'Experience' },
      };
      setAttributions(document.body, attributions);
      const tracking = createInteractionTracking(events);
      return { io, element, events, tracking };
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
    const { io, events } = timedInteractions();
    const element = stamped('node-fragment');
    document.body.append(element);
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
    coordinator.tracking.enableElement('clicks', element, { data: {} });
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
    const { io, events } = timedInteractions();
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
});

describe('automatic attribution boundaries', () => {
  it('keeps repeated containers independent while grouping sibling roots within each', async () => {
    const { io, events } = timedInteractions();
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
    const { io, events } = timedInteractions();
    const firstSend = deferred<boolean>();
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
      const { io, events } = timedInteractions();
      const firstSend = deferred<boolean>();
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

describe('createInteractionTracking permission and reset ownership', () => {
  it('clears explicit element overrides on reset and resumes automatic discovery', () => {
    const automatic = stamped('node-fragment');
    const manual = document.createElement('button');
    document.body.append(automatic, manual);
    const events = createEvents();
    const tracking = createInteractionTracking(events);
    onTestFinished(() => tracking.destroy());
    tracking.tracking.disable('views');
    tracking.tracking.disableElement('clicks', automatic);
    tracking.tracking.enableElement('clicks', manual, { data: FRAGMENT });
    click(automatic);
    click(manual);
    expect(events.trackClick).toHaveBeenCalledOnce();
    tracking.reset();
    tracking.syncConsent();
    click(manual);
    expect(events.trackClick).toHaveBeenCalledOnce();
    click(automatic);
    expect(events.trackClick).toHaveBeenCalledTimes(2);
    tracking.destroy();
  });

  it.each(['views', 'hovers'] as const)(
    'starts fresh %s at permission grant, discards withdrawn time and ignores stale observers',
    async (type) => {
      const { io, events } = timedInteractions();
      const element = stamped('node-fragment');
      document.body.append(element);
      const method = type === 'views' ? events.trackView : events.trackHover;
      const duration = type === 'views' ? 'viewDurationMs' : 'hoverDurationMs';
      const id = type === 'views' ? 'viewId' : 'hoverId';
      let allowed = false;
      let token = {};
      const tracking = createInteractionTracking(
        events,
        {},
        {
          isAllowed: (name) => allowed && name === (type === 'views' ? 'trackView' : 'trackHover'),
          getResetToken: () => token,
        }
      );
      onTestFinished(() => tracking.destroy());
      const enter = () =>
        element.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
      const leave = () =>
        element.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
      const start = () => {
        if (type === 'views') io.trigger(element, true);
        else enter();
      };
      const end = () => {
        if (type === 'views') io.trigger(element, false);
        else leave();
      };

      expect(() => io.getLast()).toThrow(/polyfill instance not found/);
      enter();
      await vi.advanceTimersByTimeAsync(type === 'views' ? 5000 : 1150);
      expect(method).not.toHaveBeenCalled();
      allowed = true;
      tracking.syncConsent();
      if (type === 'hovers') expect(() => io.getLast()).toThrow(/polyfill instance not found/);
      start();
      await vi.advanceTimersByTimeAsync(type === 'views' ? 500 : 100);
      expect(method).not.toHaveBeenCalled();
      if (type === 'views') {
        await vi.advanceTimersByTimeAsync(900);
        expect(method).toHaveBeenCalledOnce();
        expect(method.mock.calls[0]![0][duration]).toBeLessThan(2000);
      }
      end();
      await vi.advanceTimersByTimeAsync(0);
      if (type === 'hovers')
        expect(method.mock.calls.every(([args]) => args[duration] < 1000)).toBe(true);
      method.mockClear();

      start();
      const originalObserver = type === 'views' ? io.getLast() : undefined;
      await vi.advanceTimersByTimeAsync(500);
      allowed = false;
      token = {};
      tracking.reset(true);
      tracking.syncConsent();
      await vi.advanceTimersByTimeAsync(type === 'views' ? 5000 : 1500);
      end();
      await vi.advanceTimersByTimeAsync(0);
      expect(method).not.toHaveBeenCalled();
      allowed = true;
      tracking.syncConsent();
      if (originalObserver) {
        originalObserver.trigger(element, true);
        await vi.advanceTimersByTimeAsync(2000);
        expect(method).not.toHaveBeenCalled();
      } else {
        await vi.advanceTimersByTimeAsync(100);
        leave();
        expect(method.mock.calls.every(([args]) => args[duration] < 1000)).toBe(true);
      }

      start();
      await vi.advanceTimersByTimeAsync(600);
      tracking.syncConsent(); // Unchanged permission must preserve the current interval.
      await vi.advanceTimersByTimeAsync(800);
      end();
      await vi.advanceTimersByTimeAsync(0);
      expect(method.mock.calls.map(([args]) => args[duration])).toEqual([1000, 1400]);
      const [first, final] = method.mock.calls.map(([args]) => args);
      expect(final[id]).toBe(first[id]);
      expect(events.trackClick).not.toHaveBeenCalled();
      if (type === 'hovers') expect(events.trackView).not.toHaveBeenCalled();
      else expect(events.trackHover).not.toHaveBeenCalled();
      tracking.destroy();
    }
  );
});

describe('createInteractionTracking asynchronous removal', () => {
  it('keeps replacement clicks live while a removed view finishes its final send', async () => {
    const { io, events } = timedInteractions();
    const finalSend = deferred<boolean>();
    events.trackView.mockResolvedValueOnce(true).mockReturnValueOnce(finalSend.promise);
    const page = stamped('node-experience', 'main');
    const oldHero = stamped('node-fragment');
    document.body.append(page, oldHero);
    const tracking = createInteractionTracking(events);
    onTestFinished(() => tracking.destroy());
    io.trigger(page, true);
    await vi.advanceTimersByTimeAsync(1200);
    page.remove();
    oldHero.remove();
    await vi.advanceTimersByTimeAsync(0);
    const replacement = stamped('node-fragment');
    document.body.append(replacement);
    await vi.advanceTimersByTimeAsync(0);
    click(oldHero);
    click(replacement);
    expect(events.trackClick).toHaveBeenCalledOnce();
    expect(events.trackView.mock.calls.map(([args]) => args.viewDurationMs)).toEqual([1000, 1200]);
    finalSend.resolve(true);
    await vi.advanceTimersByTimeAsync(0);
    tracking.destroy();
  });
});

describe('createInteractionTracking manual-view boundaries', () => {
  const PAGE: TrackingAttribution = { entityId: 'page', entityKind: 'Experience' };
  const HERO: TrackingAttribution = { entityId: 'hero', entityKind: 'ExperienceFragment' };
  const metadata = (
    element: Element,
    scopes: Record<string, unknown> = { page: PAGE, hero: HERO }
  ) => element.setAttribute('data-ctfl-attribution', JSON.stringify({ scopes }));
  const root = (scopes = 'page hero') => stamped(scopes);

  const marker = () => {
    const element = document.createElement('section');
    element.setAttribute('data-ctfl-manual-views', 'true');
    document.body.append(element);
    return element;
  };
  function setup(auto = false, allowed = () => true) {
    const io = installIOPolyfill();
    const events = createEvents();
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

it.each(['clicks', 'views', 'hovers'] as const)(
  'reports automatic %s configuration even when the permission gate is closed',
  (interaction) => {
    const events = createEvents();
    const tracking = createInteractionTracking(
      events,
      { clicks: false, views: false, hovers: false, [interaction]: true },
      { isAllowed: () => false }
    );
    try {
      expect(tracking.hasAutoTracking()).toBe(true);
      tracking.tracking.disable(interaction);
      expect(tracking.hasAutoTracking()).toBe(false);
      expect(events.trackClick).not.toHaveBeenCalled();
      expect(events.trackView).not.toHaveBeenCalled();
      expect(events.trackHover).not.toHaveBeenCalled();
    } finally {
      tracking.destroy();
    }
  }
);

// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createInteractionTracking, TRACKING_NODE_ATTRIBUTE } from './interaction-tracking.js';
import { installIOPolyfill } from './test-fixtures/dom.js';

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
  element.setAttribute(TRACKING_NODE_ATTRIBUTE, nodeId);
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
    element.setAttribute(TRACKING_NODE_ATTRIBUTE, 'node-fragment');
    await flushMutations();
    click(element);
    element.removeAttribute(TRACKING_NODE_ATTRIBUTE);
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

      expect(io.getLast().observed.has(element)).toBe(false);
      io.getLast().trigger(element, true);
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
});

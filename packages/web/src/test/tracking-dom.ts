import { vi } from 'vitest';
import { getTrackingAttributes, TRACKING_SCOPES_ATTRIBUTE } from '../tracking-attributes.js';
import type { TrackingAttribution } from '../tracking/attribution.js';
import { installIOPolyfill } from './dom.js';

export const EXPERIENCE: TrackingAttribution = { entityId: 'landing', entityKind: 'Experience' };
export const FRAGMENT: TrackingAttribution = {
  entityId: 'hero',
  entityKind: 'ExperienceFragment',
  parentExperienceId: 'landing',
  parentVariantId: 'root-variant',
};

export const ATTRIBUTIONS: Record<string, TrackingAttribution> = {
  'node-experience': EXPERIENCE,
  'node-fragment': FRAGMENT,
};

export function setAttributions(
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

export function createEvents() {
  return {
    trackView: vi.fn().mockResolvedValue(true),
    trackHover: vi.fn().mockResolvedValue(true),
    trackClick: vi.fn().mockResolvedValue(true),
  };
}

/** A stamped element. Defaults to a `<button>` so clicks on it count as interactive. */
export function stamped(nodeId: string, tag = 'button'): HTMLElement {
  const element = document.createElement(tag);
  element.setAttribute(TRACKING_SCOPES_ATTRIBUTE, nodeId);
  return element;
}

export const click = (element: Element): void => {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};

// Lets MutationObserver callbacks (microtasks) run.
export const flushMutations = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** Explicit timer, IntersectionObserver and event doubles for coordinator tests. */
export function timedInteractions() {
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  return { io: installIOPolyfill(), events: createEvents() };
}

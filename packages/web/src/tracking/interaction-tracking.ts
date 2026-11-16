export type * from './types.js';
import type {
  EntryInteraction,
  EntryViewInteractionElementOptions,
  AutoTrackEntryInteractionOptions,
  InteractionTrackingGate,
  InteractionTracking,
  EntryInteractionApi,
  TrackedMethod,
} from './types.js';
/*
 * Automatic view/hover/click discovery uses scope-root attributes and the nearest
 * container's serialized attribution. Container identity keeps repeated renders
 * independent; roots sharing a scope key within it form one measured occurrence.
 * The initial scan and existing MutationObserver also cover SSR and later DOM
 * updates. Views apply to Experiences and Fragments; hovers/clicks to Fragments.
 * Explicit element registrations use the same detectors with private keys.
 * Manual-view containers select the final scope per root and keep each DOM root
 * independent, below explicit registrations and above automatic view policy.
 */

import type { ContentfulExperiences } from '../sdk/contentful-experiences.js';
import { isTrackedEntity, type TrackingAttribution } from './attribution.js';
import { TRACKING_ATTRIBUTION_ATTRIBUTE } from './automatic-attribution.js';
import { TRACKING_SCOPES_ATTRIBUTE } from '../tracking-attributes.js';
import { createClickDetector } from './click/create-click-detector.js';
import { createHoverDetector } from './hover/create-hover-detector.js';
import { type InteractionDetector, type InteractionKey } from './interaction-detector.js';
import { createViewDetector } from './view/create-view-detector.js';
import { initElementViewObserverOptions } from './view/element-view-observer-support.js';
import { INTERACTION_ATTRIBUTES, NOOP_TRACKING } from './interaction-controls.js';
import {
  reconcileTrackedElement,
  MANUAL_VIEWS_ATTRIBUTE,
  type ElementTrackingEntry,
} from './reconcile-tracked-element.js';

const SELECTOR = `[${TRACKING_SCOPES_ATTRIBUTE}]`;

type TrackingEvents = Pick<ContentfulExperiences, 'trackView' | 'trackHover' | 'trackClick'>;

/**
 * Starts automatic interaction tracking, sending events through `events`
 * (typically a `ContentfulExperiences` instance). A no-op outside a browser.
 */
export function createInteractionTracking(
  events: TrackingEvents,
  options: AutoTrackEntryInteractionOptions = {},
  gate: InteractionTrackingGate = { isAllowed: () => true }
): InteractionTracking {
  const auto = {
    clicks: options.clicks ?? true,
    views: options.views ?? true,
    hovers: options.hovers ?? true,
  };
  let viewOptions = initElementViewObserverOptions();
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return {
      hasAutoTracking: () => Object.values(auto).some(Boolean),
      tracking: NOOP_TRACKING,
      syncConsent() {},
      reset() {},
      endActive: async () => undefined,
      destroy() {},
    };
  }

  let destroyed = false;
  let observing = false;
  interface ManagedDetector extends ElementTrackingEntry {
    method: TrackedMethod;
  }
  // Explicit element registrations retain their supplied attribution by reference.
  const manualData = new Map<symbol, EntryViewInteractionElementOptions>();
  const manualElements = new Set<Element>();
  const resolveKeyAttribution = (key: InteractionKey): TrackingAttribution | undefined => {
    const manual = typeof key === 'symbol';
    const data = manual
      ? manualData.get(key)?.data
      : typeof key === 'object'
        ? key.attribution
        : undefined;
    if (typeof data !== 'object' || data === null) return undefined;
    const attribution = data as TrackingAttribution;
    if (!isTrackedEntity(attribution)) return undefined;
    // As with Optimization's explicit EntryData, manual data needs an entity id.
    if (manual && (typeof attribution.entityId !== 'string' || !attribution.entityId.trim()))
      return undefined;
    return attribution;
  };
  const createDetector = (type: EntryInteraction): InteractionDetector<InteractionKey> => {
    if (type === 'views')
      return createViewDetector(
        (args) => events.trackView(args),
        resolveKeyAttribution,
        viewOptions,
        gate.getResetToken
      );
    if (type === 'hovers')
      return createHoverDetector(
        (args) => events.trackHover(args),
        resolveKeyAttribution,
        gate.getResetToken
      );
    return createClickDetector((args) => events.trackClick(args), resolveKeyAttribution);
  };
  const managed = new Map<EntryInteraction, ManagedDetector>();
  for (const type of ['clicks', 'views', 'hovers'] as const) {
    managed.set(type, {
      type,
      method: type === 'views' ? 'trackView' : type === 'hovers' ? 'trackHover' : 'trackClick',
      detector: createDetector(type),
      auto: auto[type],
      running: false,
      overrides: new Map(),
      observed: new Map(),
    });
  }
  const reconcileAll = (entry: ManagedDetector): void => {
    const candidates = new Set([...entry.observed.keys(), ...entry.overrides.keys()]);
    document.querySelectorAll(SELECTOR).forEach((element) => candidates.add(element));
    for (const element of candidates)
      reconcileTrackedElement(entry, element, resolveKeyAttribution);
  };
  const mutationObserver = new MutationObserver((records) => {
    const candidates = new Set<Element>();
    const roots = new Set<Element>();
    const addRoot = (node: Node): void => {
      if (node instanceof Element) roots.add(node);
    };
    for (const record of records) {
      if (record.type === 'attributes' && record.target instanceof Element) {
        if (
          record.attributeName === TRACKING_ATTRIBUTION_ATTRIBUTE ||
          record.attributeName === MANUAL_VIEWS_ATTRIBUTE
        )
          roots.add(record.target);
        else candidates.add(record.target);
      }
      record.addedNodes.forEach(addRoot);
      record.removedNodes.forEach(addRoot);
    }
    const collect = (element: Element): void => {
      if (manualElements.has(element) || element.matches(SELECTOR)) candidates.add(element);
    };
    for (const node of roots) {
      // Mutation records may repeat a root or include both a parent and its child.
      let parent = node.parentElement;
      while (parent && !roots.has(parent)) parent = parent.parentElement;
      if (parent) continue;
      collect(node);
      // A membership index finds attribute-free manual descendants without scanning
      // every interaction's override map for every inserted or removed root.
      node.querySelectorAll(manualElements.size ? '*' : SELECTOR).forEach(collect);
    }
    for (const entry of managed.values()) {
      for (const element of candidates)
        reconcileTrackedElement(entry, element, resolveKeyAttribution);
    }
  });
  const syncEntry = (entry: ManagedDetector, restart = false): void => {
    if (destroyed) return;
    // Discovery remains available for dynamic attribute opt-ins even with auto off.
    const allowed = gate.isAllowed(entry.method);
    if (entry.running && (!allowed || restart)) {
      entry.detector.stop();
      entry.running = false;
      entry.observed.clear();
    }
    if (allowed && !entry.running) {
      if (entry.type === 'views') entry.detector = createDetector('views');
      entry.detector.start();
      entry.running = true;
    }
    if (entry.running) reconcileAll(entry);
    if (!observing && [...managed.values()].some((candidate) => candidate.running)) {
      observing = true;
      mutationObserver.observe(document, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [
          TRACKING_SCOPES_ATTRIBUTE,
          TRACKING_ATTRIBUTION_ATTRIBUTE,
          MANUAL_VIEWS_ATTRIBUTE,
          ...Object.values(INTERACTION_ATTRIBUTES),
        ],
      });
    } else if (observing && ![...managed.values()].some((candidate) => candidate.running)) {
      mutationObserver.disconnect();
      observing = false;
    }
  };
  const sync = (): void => {
    for (const entry of managed.values()) syncEntry(entry);
  };
  const reset = (preserveOverrides = false, preservePending = false): void => {
    mutationObserver.disconnect();
    observing = false;
    for (const entry of managed.values()) {
      entry.running = false;
      entry.detector.stop({ preservePending });
      entry.observed.clear();
      if (!preserveOverrides) entry.overrides.clear();
    }
    if (!preserveOverrides) manualElements.clear();
    if (!preserveOverrides && !preservePending) manualData.clear();
  };
  const tracking: EntryInteractionApi = {
    enable(type, startOptions) {
      if (destroyed) return;
      const entry = managed.get(type)!;
      const next = type === 'views' ? initElementViewObserverOptions(startOptions) : viewOptions;
      const restart = next.root !== viewOptions.root || next.rootMargin !== viewOptions.rootMargin;
      entry.auto = true;
      viewOptions = next;
      syncEntry(entry, restart);
    },
    disable(type) {
      if (destroyed) return;
      const entry = managed.get(type)!;
      entry.auto = false;
      syncEntry(entry);
    },
    enableElement(type, element, elementOptions) {
      if (destroyed) return;
      const entry = managed.get(type)!;
      const previous = entry.overrides.get(element);
      if (previous?.enabled && previous.options === elementOptions) return;
      // Separate occurrence keys preserve the existing multi-root automatic grouping.
      if (previous) manualData.delete(previous.key);
      const key = Symbol();
      if (elementOptions) manualData.set(key, elementOptions);
      entry.overrides.set(element, { enabled: true, options: elementOptions, key });
      manualElements.add(element);
      syncEntry(entry);
    },
    disableElement(type, element) {
      if (destroyed) return;
      const entry = managed.get(type)!;
      const previous = entry.overrides.get(element);
      if (previous) manualData.delete(previous.key);
      entry.overrides.set(element, { enabled: false, key: Symbol() });
      manualElements.add(element);
      syncEntry(entry);
    },
    clearElement(type, element) {
      if (destroyed) return;
      const entry = managed.get(type)!;
      const previous = entry.overrides.get(element);
      if (entry.overrides.delete(element)) {
        if (![...managed.values()].some((candidate) => candidate.overrides.has(element)))
          manualElements.delete(element);
        if (previous) manualData.delete(previous.key);
        syncEntry(entry);
      }
    },
  };
  sync();
  return {
    hasAutoTracking: () => [...managed.values()].some((entry) => entry.auto),
    tracking,
    syncConsent: sync,
    reset,
    async endActive() {
      await Promise.all(
        [...managed.values()]
          .filter((entry) => entry.running)
          .map((entry) => entry.detector.endActive?.())
      );
    },
    destroy() {
      destroyed = true;
      reset(false, true);
    },
  };
}

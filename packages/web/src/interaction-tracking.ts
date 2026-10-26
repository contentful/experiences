/*
 * Automatic view/hover/click discovery uses scope-root attributes and the nearest
 * container's serialized attribution. Container identity keeps repeated renders
 * independent; roots sharing a scope key within it form one measured occurrence.
 * The initial scan and existing MutationObserver also cover SSR and later DOM
 * updates. Views apply to Experiences and Fragments; hovers/clicks to Fragments.
 * Explicit element registrations use the same detectors with private keys.
 */

import type { ContentfulExperiences } from './contentful-experiences.js';
import { isTrackedEntity, type TrackingAttribution } from './tracking/attribution.js';
import {
  readAutomaticKeys,
  TRACKING_ATTRIBUTION_ATTRIBUTE,
} from './tracking/automatic-attribution.js';
import { TRACKING_SCOPES_ATTRIBUTE } from './tracking-attributes.js';
import { createClickDetector } from './tracking/click/create-click-detector.js';
import { createHoverDetector } from './tracking/hover/create-hover-detector.js';
import {
  type InteractionDetector,
  type InteractionKey,
  toInteractionArgs,
} from './tracking/interaction-detector.js';
import { createViewDetector } from './tracking/view/create-view-detector.js';
import {
  initElementViewObserverOptions,
  type ElementViewObserverOptions,
} from './tracking/view/element-view-observer-support.js';
import { INTERACTION_ATTRIBUTES, NOOP_TRACKING } from './tracking/interaction-controls.js';

const SELECTOR = `[${TRACKING_SCOPES_ATTRIBUTE}]`;

/** Optimization-compatible interaction controls. Manual data is Experiences attribution. */
export type EntryInteraction = keyof EntryInteractionTrackers;
export type EntryElementInteraction = EntryInteraction;
export type AutoTrackEntryInteractionOptions = Partial<Record<EntryInteraction, boolean>>;
export type EntryViewInteractionStartOptions = ElementViewObserverOptions;
export interface EntryClickInteractionElementOptions {
  /** Experiences TrackingAttribution; valid data overrides automatic scope attribution. */
  readonly data?: unknown;
}
export interface EntryViewInteractionElementOptions {
  /** Experiences TrackingAttribution for this element's view occurrence. Retained by reference. */
  readonly data?: unknown;
}
export interface EntryHoverInteractionElementOptions {
  /** Experiences Fragment TrackingAttribution for this element's hover occurrence. */
  readonly data?: unknown;
}
export interface EntryInteractionStartOptionsMap {
  clicks: undefined;
  views: EntryViewInteractionStartOptions | undefined;
  hovers: undefined;
}
export interface EntryInteractionElementOptionsMap {
  clicks: EntryClickInteractionElementOptions;
  views: EntryViewInteractionElementOptions;
  hovers: EntryHoverInteractionElementOptions;
}
/** Minimal tracker contract for one interaction, matching Optimization. */
export interface EntryInteractionTracker<TStartOptions = never, TElementOptions = never> {
  start: (options?: TStartOptions) => void;
  stop: () => void;
  setAuto?: (enabled: boolean) => void;
  enableElement?: (element: Element, options?: TElementOptions) => void;
  disableElement?: (element: Element) => void;
  clearElement?: (element: Element) => void;
}

/** Type contract for the three tracked interactions; no runtime registry is exposed. */
export interface EntryInteractionTrackers {
  clicks: EntryInteractionTracker<
    EntryInteractionStartOptionsMap['clicks'],
    EntryInteractionElementOptionsMap['clicks']
  >;
  views: EntryInteractionTracker<
    EntryInteractionStartOptionsMap['views'],
    EntryInteractionElementOptionsMap['views']
  >;
  hovers: EntryInteractionTracker<
    EntryInteractionStartOptionsMap['hovers'],
    EntryInteractionElementOptionsMap['hovers']
  >;
}

export type EntryInteractionStartOptions<T extends EntryInteraction> =
  EntryInteractionStartOptionsMap[T];
export type EntryInteractionElementOptions<T extends EntryElementInteraction> =
  EntryInteractionElementOptionsMap[T];
export interface EntryInteractionApi {
  enable<T extends EntryInteraction>(
    interaction: T,
    options?: EntryInteractionStartOptions<T>
  ): void;
  disable(interaction: EntryInteraction): void;
  enableElement<T extends EntryElementInteraction>(
    interaction: T,
    element: Element,
    options?: EntryInteractionElementOptions<T>
  ): void;
  disableElement(interaction: EntryElementInteraction, element: Element): void;
  clearElement(interaction: EntryElementInteraction, element: Element): void;
}

/** The event methods interaction tracking sends through, which consent can gate. */
export type TrackedMethod = 'trackView' | 'trackHover' | 'trackClick';

/**
 * Wiring that the runtime supplies rather than the application: whether a method may
 * currently be sent. Detectors run only while it is, so permission starts a fresh
 * measurement instead of reporting time measured before it was granted.
 */
export interface InteractionTrackingGate {
  isAllowed(method: TrackedMethod): boolean;
  /** Invalidates delayed callbacks across the owning runtime's lifecycle boundaries. */
  getResetToken?(): unknown;
}

export interface InteractionTracking {
  hasAutoTracking(): boolean;
  readonly tracking: EntryInteractionApi;
  /**
   * Starts or stops detectors to match what is currently permitted. Call after consent
   * changes. A detector that becomes permitted starts a new measurement interval.
   */
  syncConsent(): void;
  /** Discards measurements and stops detectors; consent synchronization can resume them. */
  reset(preserveOverrides?: boolean): void;
  /** Ends in-progress views/hovers, sending their final events, and awaits them. */
  endActive(): Promise<void>;
  /** Stops discovery and every detector. Call `endActive()` first to flush in-progress events. */
  destroy(): void;
}

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
  interface Override {
    enabled: boolean;
    options?: EntryViewInteractionElementOptions;
    key: symbol;
  }
  interface ManagedDetector {
    type: EntryInteraction;
    method: TrackedMethod;
    detector: InteractionDetector<InteractionKey>;
    auto: boolean;
    running: boolean;
    overrides: Map<Element, Override>;
    observed: Map<Element, Map<InteractionKey, string>>;
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
  const entityKey = (attribution: TrackingAttribution): string =>
    JSON.stringify(toInteractionArgs(attribution));
  const reconcile = (entry: ManagedDetector, element: Element): void => {
    if (!entry.running) return;
    const next = new Map<InteractionKey, string>();
    const override = entry.overrides.get(element);
    const attr = element.getAttribute(INTERACTION_ATTRIBUTES[entry.type])?.trim().toLowerCase();
    const enabled =
      override?.enabled ?? (attr === 'true' ? true : attr === 'false' ? false : entry.auto);
    if (enabled && element.isConnected) {
      const manual = override?.enabled && resolveKeyAttribution(override.key);
      const keys = manual ? [override.key] : readAutomaticKeys(element);
      for (const key of keys) {
        const attribution = resolveKeyAttribution(key);
        if (attribution) next.set(key, entityKey(attribution));
      }
    }
    const current = entry.observed.get(element) ?? new Map<InteractionKey, string>();
    for (const [key, entity] of current) {
      if (next.get(key) !== entity)
        entry.detector.onElementRemoved(element, key, {
          finalize: !element.isConnected || enabled,
        });
    }
    for (const [key, entity] of next) {
      if (current.get(key) !== entity) entry.detector.onElementAdded(element, key);
    }
    if (next.size) entry.observed.set(element, next);
    else entry.observed.delete(element);
  };
  const reconcileAll = (entry: ManagedDetector): void => {
    const candidates = new Set([...entry.observed.keys(), ...entry.overrides.keys()]);
    document.querySelectorAll(SELECTOR).forEach((element) => candidates.add(element));
    for (const element of candidates) reconcile(entry, element);
  };
  const mutationObserver = new MutationObserver((records) => {
    const candidates = new Set<Element>();
    const roots = new Set<Element>();
    const addRoot = (node: Node): void => {
      if (node instanceof Element) roots.add(node);
    };
    for (const record of records) {
      if (record.type === 'attributes' && record.target instanceof Element) {
        if (record.attributeName === TRACKING_ATTRIBUTION_ATTRIBUTE) roots.add(record.target);
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
      for (const element of candidates) reconcile(entry, element);
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

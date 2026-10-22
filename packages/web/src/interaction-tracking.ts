/*
 * Automatic view/hover/click tracking for rendered Experience/Fragment scopes,
 * keyed by one generic DOM attribute.
 *
 * An element renders `TRACKING_SCOPES_ATTRIBUTE` listing the occurrence key of
 * every scope it is a top-level element of. This module discovers those
 * elements — an initial scan plus a `MutationObserver`, so nodes added after
 * first paint (client navigation, lazy content) are picked up — and hands them
 * to the view/hover/click detectors once per key. Elements sharing a key are
 * one scope occurrence and report as one series: a Fragment with several root
 * elements is one view, and two copies of a Fragment are two unless they sit
 * directly next to each other (XDA gives both the same layer row and node ids,
 * so only position can separate them). Detectors resolve a
 * key's attribution through the caller's lookup when an event fires, and apply
 * scope-kind rules themselves: views for Experiences and Fragments, hovers and
 * clicks for Fragments only.
 *
 * Attribution never lives in the DOM: the attribute holds opaque keys, and the
 * caller owns the key → attribution lookup (`plan.attribution.scopes`). It must
 * be serializable data when rendering happens on the server and tracking in the
 * browser.
 *
 * The coordinator stays internal; ContentfulExperiences exposes its imperative
 * controls as `tracking` and supplies attribution through an optional session.
 * Manual element data uses the same detectors with a private occurrence key.
 */

import type { ContentfulExperiences } from './contentful-experiences.js';
import { isTrackedEntity, type TrackingAttribution } from './tracking/attribution.js';
import { TRACKING_SCOPES_ATTRIBUTE } from './tracking-attributes.js';
import { createClickDetector } from './tracking/click/create-click-detector.js';
import { createHoverDetector } from './tracking/hover/create-hover-detector.js';
import {
  type InteractionDetector,
  type InteractionKey,
  toInteractionArgs,
} from './tracking/interaction-detector.js';
import { createViewDetector } from './tracking/view/create-view-detector.js';
import type { ElementViewObserverOptions } from './tracking/view/element-view-observer-support.js';

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

export interface InteractionTrackingOptions {
  /**
   * Resolves a stamped scope occurrence key to its attribution. Return
   * `undefined` for a key with nothing to track — it is then left unobserved.
   */
  resolveAttribution: (key: string) => TrackingAttribution | undefined;
  /** Subtree to discover elements in. Defaults to `document`. */
  root?: Document | Element;
  /** `false` disables view tracking; an object sets the view root/rootMargin. Defaults to enabled. */
  views?: boolean | ElementViewObserverOptions;
  /** `false` disables hover tracking. Defaults to enabled. */
  hovers?: boolean;
  /** `false` disables click tracking. Defaults to enabled. */
  clicks?: boolean;
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

interface InteractionTrackingSettings {
  auto: Record<EntryInteraction, boolean>;
  viewOptions?: EntryViewInteractionStartOptions;
}

export interface InteractionTracking {
  /** Carries SDK settings across a new attribution session without changing public APIs. */
  getSettings(): InteractionTrackingSettings;
  /**
   * Re-resolves every discovered element against `resolveAttribution` — call
   * after the lookup's data changes (e.g. new attribution for the same DOM).
   */
  readonly tracking: EntryInteractionApi;
  /** Transfers caller-owned overrides when an automatic attribution session starts. */
  transferOverridesTo(target: EntryInteractionApi): void;
  refresh(): void;
  /**
   * Starts or stops detectors to match what is currently permitted. Call after consent
   * changes. A detector that becomes permitted starts a new measurement interval.
   */
  syncConsent(): void;
  /** Discards measurements and stops detectors; refresh or consent sync can resume them. */
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
  options: InteractionTrackingOptions,
  gate: InteractionTrackingGate = { isAllowed: () => true },
  initialSettings?: InteractionTrackingSettings
): InteractionTracking {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return {
      getSettings: () => ({
        auto: {
          views:
            options.views === undefined
              ? (initialSettings?.auto.views ?? true)
              : options.views !== false,
          clicks: options.clicks ?? initialSettings?.auto.clicks ?? true,
          hovers: options.hovers ?? initialSettings?.auto.hovers ?? true,
        },
        viewOptions:
          typeof options.views === 'object'
            ? options.views
            : options.views === true
              ? undefined
              : initialSettings?.viewOptions,
      }),
      tracking: {
        enable() {},
        disable() {},
        enableElement() {},
        disableElement() {},
        clearElement() {},
      },
      transferOverridesTo() {},
      refresh() {},
      syncConsent() {},
      reset() {},
      endActive: async () => undefined,
      destroy() {},
    };
  }

  const root = options.root ?? document;
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
  // Retain attribution lookup closures for draining sessions after stop().
  const manualData = new Map<symbol, EntryViewInteractionElementOptions>();
  const resolveKeyAttribution = (key: InteractionKey): TrackingAttribution | undefined => {
    const manual = typeof key === 'symbol';
    const data = manual ? manualData.get(key)?.data : options.resolveAttribution(key);
    if (typeof data !== 'object' || data === null) return undefined;
    const attribution = data as TrackingAttribution;
    if (!isTrackedEntity(attribution)) return undefined;
    // As with Optimization's explicit EntryData, manual data needs an entity id.
    if (manual && (typeof attribution.entityId !== 'string' || !attribution.entityId.trim()))
      return undefined;
    return attribution;
  };
  let viewOptions =
    typeof options.views === 'object'
      ? options.views
      : options.views === true
        ? undefined
        : initialSettings?.viewOptions;
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
      auto:
        options[type] === undefined
          ? (initialSettings?.auto[type] ?? true)
          : options[type] !== false,
      running: false,
      overrides: new Map(),
      observed: new Map(),
    });
  }
  const isInRoot = (element: Element): boolean =>
    element.isConnected && (root === document || root.contains(element));
  const entityKey = (attribution: TrackingAttribution): string =>
    JSON.stringify(toInteractionArgs(attribution));
  const readKeys = (element: Element): string[] =>
    (element.getAttribute(TRACKING_SCOPES_ATTRIBUTE) ?? '').split(/\s+/).filter(Boolean);
  const reconcile = (entry: ManagedDetector, element: Element): void => {
    if (!entry.running) return;
    const next = new Map<InteractionKey, string>();
    const override = entry.overrides.get(element);
    const attr = element.getAttribute(`data-ctfl-track-${entry.type}`)?.trim().toLowerCase();
    const enabled =
      override?.enabled ?? (attr === 'true' ? true : attr === 'false' ? false : entry.auto);
    // Explicit registrations follow Optimization's document-wide element API;
    // the session root bounds automatic discovery only.
    if (enabled && (override?.enabled ? element.isConnected : isInRoot(element))) {
      const manual = override?.enabled && resolveKeyAttribution(override.key);
      const keys = manual ? [override.key] : readKeys(element);
      for (const key of keys) {
        const attribution = resolveKeyAttribution(key);
        if (attribution) next.set(key, entityKey(attribution));
      }
    }
    const current = entry.observed.get(element) ?? new Map<InteractionKey, string>();
    for (const [key, entity] of current) {
      if (next.get(key) !== entity) entry.detector.onElementRemoved(element, key);
    }
    for (const [key, entity] of next) {
      if (current.get(key) !== entity) entry.detector.onElementAdded(element, key);
    }
    if (next.size) entry.observed.set(element, next);
    else entry.observed.delete(element);
  };
  const reconcileAll = (entry: ManagedDetector): void => {
    const candidates = new Set([...entry.observed.keys(), ...entry.overrides.keys()]);
    if (root instanceof Element && root.matches(SELECTOR)) candidates.add(root);
    root.querySelectorAll(SELECTOR).forEach((element) => candidates.add(element));
    for (const element of candidates) reconcile(entry, element);
  };
  const mutationObserver = new MutationObserver((records) => {
    const candidates = new Set<Element>();
    const collect = (node: Node): void => {
      if (!(node instanceof Element)) return;
      candidates.add(node);
      node.querySelectorAll(SELECTOR).forEach((element) => candidates.add(element));
      // Manually registered elements need no discovery attribute.
      for (const entry of managed.values()) {
        for (const element of entry.overrides.keys()) {
          if (node.contains(element)) candidates.add(element);
        }
      }
    };
    for (const record of records) {
      if (record.type === 'attributes' && record.target instanceof Element)
        candidates.add(record.target);
      record.addedNodes.forEach(collect);
      record.removedNodes.forEach(collect);
    }
    for (const entry of managed.values()) {
      for (const element of candidates) reconcile(entry, element);
    }
  });
  const syncEntry = (entry: ManagedDetector, restart = false): void => {
    if (destroyed) return;
    const allowed =
      gate.isAllowed(entry.method) &&
      (entry.auto || [...entry.overrides.values()].some((override) => override.enabled));
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
    reconcileAll(entry);
    if (!observing && [...managed.values()].some((candidate) => candidate.running)) {
      observing = true;
      mutationObserver.observe(document, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [
          TRACKING_SCOPES_ATTRIBUTE,
          'data-ctfl-track-views',
          'data-ctfl-track-hovers',
          'data-ctfl-track-clicks',
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
    if (!preserveOverrides && !preservePending) manualData.clear();
  };
  const tracking: EntryInteractionApi = {
    enable(type, startOptions) {
      if (destroyed) return;
      const entry = managed.get(type)!;
      entry.auto = true;
      if (type === 'views') viewOptions = startOptions;
      syncEntry(entry, true);
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
      syncEntry(entry);
    },
    disableElement(type, element) {
      if (destroyed) return;
      const entry = managed.get(type)!;
      const previous = entry.overrides.get(element);
      if (previous) manualData.delete(previous.key);
      entry.overrides.set(element, { enabled: false, key: Symbol() });
      syncEntry(entry);
    },
    clearElement(type, element) {
      if (destroyed) return;
      const entry = managed.get(type)!;
      const previous = entry.overrides.get(element);
      if (entry.overrides.delete(element)) {
        if (previous) manualData.delete(previous.key);
        syncEntry(entry);
      }
    },
  };
  sync();
  return {
    getSettings: () => ({
      auto: {
        clicks: managed.get('clicks')!.auto,
        views: managed.get('views')!.auto,
        hovers: managed.get('hovers')!.auto,
      },
      viewOptions,
    }),
    tracking,
    transferOverridesTo(target) {
      for (const entry of managed.values()) {
        for (const [element, override] of entry.overrides) {
          if (override.enabled) target.enableElement(entry.type, element, override.options);
          else target.disableElement(entry.type, element);
        }
      }
    },
    refresh: sync,
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

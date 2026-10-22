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
 * Internal: not exported from the package entry. The public surface is meant
 * to be the configured runtime/root (`createExperiences({ optimization })` in
 * the consumer DX proposal), which will start and stop this itself.
 */

import type { ContentfulExperiences } from './contentful-experiences.js';
import { isTrackedEntity, type TrackingAttribution } from './tracking/attribution.js';
import { TRACKING_SCOPES_ATTRIBUTE } from './tracking-attributes.js';
import { createClickDetector } from './tracking/click/create-click-detector.js';
import { createHoverDetector } from './tracking/hover/create-hover-detector.js';
import { type InteractionDetector, toInteractionArgs } from './tracking/interaction-detector.js';
import { createViewDetector } from './tracking/view/create-view-detector.js';
import type { ElementViewObserverOptions } from './tracking/view/element-view-observer-support.js';

const SELECTOR = `[${TRACKING_SCOPES_ATTRIBUTE}]`;

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

export interface InteractionTracking {
  /**
   * Re-resolves every discovered element against `resolveAttribution` — call
   * after the lookup's data changes (e.g. new attribution for the same DOM).
   */
  refresh(): void;
  /**
   * Starts or stops detectors to match what is currently permitted. Call after consent
   * changes. A detector that becomes permitted starts a new measurement interval.
   */
  syncConsent(): void;
  /** Discards measurements and stops detectors; refresh or consent sync can resume them. */
  reset(): void;
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
  gate: InteractionTrackingGate = { isAllowed: () => true }
): InteractionTracking {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return {
      refresh: () => undefined,
      syncConsent: () => undefined,
      reset: () => undefined,
      endActive: async () => undefined,
      destroy: () => undefined,
    };
  }

  const root = options.root ?? document;
  let destroyed = false;
  let observing = false;

  // The single path detectors read attribution through. Plan attribution is
  // typed Experience | Fragment, so this is a defensive runtime check for
  // lookups that return another kind: that is treated as "nothing to track" and
  // its key is never observed.
  const resolveKeyAttribution = (key: string): TrackingAttribution | undefined => {
    const attribution = options.resolveAttribution(key);
    return isTrackedEntity(attribution) ? attribution : undefined;
  };

  interface ManagedDetector {
    readonly method: TrackedMethod;
    readonly detector: InteractionDetector;
    running: boolean;
  }
  const managed: ManagedDetector[] = [];
  const add = (method: TrackedMethod, detector: InteractionDetector): void => {
    managed.push({ method, detector, running: false });
  };
  if (options.views !== false) {
    const viewOptions = typeof options.views === 'object' ? options.views : undefined;
    add(
      'trackView',
      createViewDetector(
        (args) => events.trackView(args),
        resolveKeyAttribution,
        viewOptions,
        gate.getResetToken
      )
    );
  }
  if (options.hovers !== false) {
    add(
      'trackHover',
      createHoverDetector(
        (args) => events.trackHover(args),
        resolveKeyAttribution,
        gate.getResetToken
      )
    );
  }
  if (options.clicks !== false) {
    add(
      'trackClick',
      createClickDetector((args) => events.trackClick(args), resolveKeyAttribution)
    );
  }
  // Only detectors that are currently permitted observe anything. A detector that is
  // not running holds no elements and no measurement.
  const running = (): InteractionDetector[] =>
    managed.filter((entry) => entry.running).map((entry) => entry.detector);

  // Elements currently handed to the detectors: for each, the keys it was handed
  // over under, with the entity each key resolved to.
  const observed = new Map<Element, Map<string, string>>();

  const isInRoot = (element: Element): boolean =>
    element.isConnected && (root === document || root.contains(element));

  /** Identifies what an interaction is reported against; any change is a different target. */
  const entityKey = (attribution: TrackingAttribution): string =>
    JSON.stringify(toInteractionArgs(attribution));

  const readKeys = (element: Element): string[] =>
    (element.getAttribute(TRACKING_SCOPES_ATTRIBUTE) ?? '').split(/\s+/).filter(Boolean);

  /**
   * Brings one element's detector state in line with the DOM and the lookup.
   * A key that now names a different entity — the attribute changed, or
   * `refresh()` resolved different attribution — is removed and re-added, so no
   * view or hover is reported under two entities. The Optimization SDK does the
   * same when an entry id attribute changes.
   */
  const reconcile = (element: Element): void => {
    const next = new Map<string, string>();
    if (isInRoot(element)) {
      for (const key of readKeys(element)) {
        const attribution = resolveKeyAttribution(key);
        if (attribution) next.set(key, entityKey(attribution));
      }
    }
    const current = observed.get(element) ?? new Map<string, string>();

    for (const [key, entity] of current) {
      if (next.get(key) === entity) continue;
      for (const detector of running()) detector.onElementRemoved(element, key);
    }
    for (const [key, entity] of next) {
      if (current.get(key) === entity) continue;
      for (const detector of running()) detector.onElementAdded(element, key);
    }

    if (next.size > 0) observed.set(element, next);
    else observed.delete(element);
  };

  const collectCandidates = (node: Node, candidates: Set<Element>): void => {
    if (!(node instanceof Element)) return;
    if (node.hasAttribute(TRACKING_SCOPES_ATTRIBUTE)) candidates.add(node);
    node.querySelectorAll(SELECTOR).forEach((element) => candidates.add(element));
  };

  // Reconciles each batch as a whole, so a node moved within one batch
  // (removed then re-added) ends up observed rather than dropped.
  const mutationObserver = new MutationObserver((records) => {
    const candidates = new Set<Element>();
    for (const record of records) {
      if (record.type === 'attributes' && record.target instanceof Element) {
        candidates.add(record.target);
      }
      record.addedNodes.forEach((node) => collectCandidates(node, candidates));
      record.removedNodes.forEach((node) => collectCandidates(node, candidates));
    }
    for (const element of candidates) reconcile(element);
  });

  /**
   * Brings each detector in line with what is permitted now. A detector that stops
   * drops any measurement in progress; one that starts begins fresh over every
   * (element, key) already observed, so time measured before permission is never
   * reported.
   */
  const sync = (): void => {
    if (destroyed) return;
    for (const entry of managed) {
      const allowed = gate.isAllowed(entry.method);
      if (allowed && !entry.running) {
        entry.running = true;
        entry.detector.start();
        for (const [element, keys] of observed) {
          for (const key of keys.keys()) entry.detector.onElementAdded(element, key);
        }
      } else if (!allowed && entry.running) {
        entry.running = false;
        entry.detector.stop();
      }
    }
    if (!observing && managed.some((entry) => entry.running)) {
      observing = true;
      mutationObserver.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [TRACKING_SCOPES_ATTRIBUTE],
      });
      root.querySelectorAll(SELECTOR).forEach(reconcile);
    }
  };

  const reset = (preservePending = false): void => {
    mutationObserver.disconnect();
    observing = false;
    for (const entry of managed) {
      entry.running = false;
      entry.detector.stop({ preservePending });
    }
    observed.clear();
  };

  sync();

  return {
    refresh() {
      if (destroyed) return;
      sync();
      const candidates = new Set<Element>(observed.keys());
      root.querySelectorAll(SELECTOR).forEach((element) => candidates.add(element));
      for (const element of candidates) reconcile(element);
    },
    syncConsent: sync,
    reset,
    async endActive() {
      await Promise.all(running().map((detector) => detector.endActive?.()));
    },
    destroy() {
      destroyed = true;
      reset(true);
    },
  };
}

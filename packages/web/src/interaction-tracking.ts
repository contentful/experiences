/*
 * Automatic view/hover/click tracking for rendered Experience/Fragment nodes,
 * keyed by one generic DOM attribute.
 *
 * Each tracked Experience/Fragment instance renders `TRACKING_NODE_ATTRIBUTE`
 * (its node id) on one element. This module discovers those elements — an
 * initial scan plus a `MutationObserver`, so nodes added after first paint
 * (client navigation, lazy content) are picked up — and hands them to the
 * view/hover/click detectors. Detectors resolve an element's attribution
 * through the caller's lookup when an event fires, and apply node-type rules
 * themselves: views for Experiences and Fragments, hovers and clicks for
 * Fragments only.
 *
 * Attribution never lives in the DOM: the attribute is an opaque key, and the
 * caller owns the id → attribution lookup. It must be serializable data when
 * rendering happens on the server and tracking in the browser.
 *
 * Internal: not exported from the package entry. The public surface is meant
 * to be the configured runtime/root (`createExperiences({ optimization })` in
 * the consumer DX proposal), which will start and stop this itself.
 */

import type { ContentfulExperiences } from './contentful-experiences.js';
import type { TrackingAttribution } from './tracking/attribution.js';
import { TRACKING_NODE_ATTRIBUTE } from './tracking-attributes.js';
import { createClickDetector } from './tracking/click/create-click-detector.js';
import { createHoverDetector } from './tracking/hover/create-hover-detector.js';
import type { InteractionDetector } from './tracking/interaction-detector.js';
import { createViewDetector } from './tracking/view/create-view-detector.js';
import type { ElementViewObserverOptions } from './tracking/view/element-view-observer-support.js';

export { TRACKING_NODE_ATTRIBUTE };

const SELECTOR = `[${TRACKING_NODE_ATTRIBUTE}]`;

export interface InteractionTrackingOptions {
  /**
   * Resolves a stamped node id to its attribution. Return `undefined` for an
   * id with nothing to track — the element is then left unobserved.
   */
  resolveAttribution: (nodeId: string) => TrackingAttribution | undefined;
  /** Subtree to discover elements in. Defaults to `document`. */
  root?: Document | Element;
  /** `false` disables view tracking; an object sets the view root/rootMargin. Defaults to enabled. */
  views?: boolean | ElementViewObserverOptions;
  /** `false` disables hover tracking. Defaults to enabled. */
  hovers?: boolean;
  /** `false` disables click tracking. Defaults to enabled. */
  clicks?: boolean;
}

export interface InteractionTracking {
  /**
   * Re-resolves every discovered element against `resolveAttribution` — call
   * after the lookup's data changes (e.g. new attribution for the same DOM).
   */
  refresh(): void;
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
  options: InteractionTrackingOptions
): InteractionTracking {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return { refresh: () => undefined, endActive: async () => undefined, destroy: () => undefined };
  }

  const root = options.root ?? document;

  const resolveElementAttribution = (element: Element): TrackingAttribution | undefined => {
    const nodeId = element.getAttribute(TRACKING_NODE_ATTRIBUTE);
    return nodeId ? options.resolveAttribution(nodeId) : undefined;
  };

  const detectors: InteractionDetector[] = [];
  if (options.views !== false) {
    const viewOptions = typeof options.views === 'object' ? options.views : undefined;
    detectors.push(
      createViewDetector((args) => events.trackView(args), resolveElementAttribution, viewOptions)
    );
  }
  if (options.hovers !== false) {
    detectors.push(
      createHoverDetector((args) => events.trackHover(args), resolveElementAttribution)
    );
  }
  if (options.clicks !== false) {
    detectors.push(
      createClickDetector((args) => events.trackClick(args), resolveElementAttribution)
    );
  }

  // Elements currently handed to the detectors.
  const observed = new Set<Element>();

  const isInRoot = (element: Element): boolean =>
    element.isConnected && (root === document || root.contains(element));

  /** Brings one element's detector state in line with the DOM and the lookup. */
  const reconcile = (element: Element): void => {
    const trackable = isInRoot(element) && resolveElementAttribution(element) !== undefined;

    if (trackable && !observed.has(element)) {
      observed.add(element);
      for (const detector of detectors) detector.onElementAdded(element);
    } else if (!trackable && observed.has(element)) {
      observed.delete(element);
      for (const detector of detectors) detector.onElementRemoved(element);
    }
  };

  const collectCandidates = (node: Node, candidates: Set<Element>): void => {
    if (!(node instanceof Element)) return;
    if (node.hasAttribute(TRACKING_NODE_ATTRIBUTE)) candidates.add(node);
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

  for (const detector of detectors) detector.start();
  mutationObserver.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [TRACKING_NODE_ATTRIBUTE],
  });
  root.querySelectorAll(SELECTOR).forEach(reconcile);

  return {
    refresh() {
      const candidates = new Set<Element>(observed);
      root.querySelectorAll(SELECTOR).forEach((element) => candidates.add(element));
      for (const element of candidates) reconcile(element);
    },
    async endActive() {
      await Promise.all(detectors.map((detector) => detector.endActive?.()));
    },
    destroy() {
      mutationObserver.disconnect();
      for (const detector of detectors) detector.stop();
      observed.clear();
    },
  };
}

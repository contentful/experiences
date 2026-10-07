import type { TrackingAttribution } from './attribution.js';

import type { InteractionDetector, ResolveScopeAttribution } from './interaction-detector.js';

interface TimedObserver {
  observe(element: Element): void;
  unobserve(element: Element): void;
  disconnect(): void;
  endActive(): Promise<void>;
}

interface CreateTimedDetectorOptions<TInfo> {
  resolveAttribution: ResolveScopeAttribution;
  isSupported?: () => boolean;
  /** Defaults to every attribution being eligible. */
  isEligible?: (attribution: TrackingAttribution) => boolean;
  /** Whether this callback ends the session its earlier callback started. */
  isFinal: (info: TInfo) => boolean;
  /**
   * One observer per scope occurrence. It must treat everything observed by it
   * as a single session, so an occurrence spread over several elements reports
   * one series rather than one per element.
   */
  createObserver: (callback: (info: TInfo) => Promise<void>) => TimedObserver;
  track: (attribution: TrackingAttribution, info: TInfo) => Promise<void>;
}

interface Group {
  readonly elements: Set<Element>;
  observer?: TimedObserver;
}

export function createTimedDetector<TInfo>({
  resolveAttribution,
  isSupported = () => true,
  isEligible = () => true,
  isFinal,
  createObserver,
  track,
}: CreateTimedDetectorOptions<TInfo>): InteractionDetector {
  const groups = new Map<string, Group>();
  let started = false;

  const startGroup = (key: string, group: Group): void => {
    // A group's callbacks are serialised, so one session is in flight at a time.
    // Its final event keeps the attribution that qualified it: a slow send can
    // delay the final past a `refresh()` that re-points this key.
    let qualified: TrackingAttribution | undefined;
    const observer = createObserver(async (info) => {
      let attribution: TrackingAttribution | undefined;
      if (isFinal(info)) {
        attribution = qualified ?? resolveAttribution(key);
        qualified = undefined;
      } else {
        attribution = resolveAttribution(key);
        qualified = attribution;
      }
      if (!attribution || !isEligible(attribution)) return;
      await track(attribution, info);
    });
    group.observer = observer;
    for (const element of group.elements) observer.observe(element);
  };

  return {
    start() {
      if (started || !isSupported()) return;
      started = true;
      for (const [key, group] of groups) startGroup(key, group);
    },
    stop() {
      for (const group of groups.values()) group.observer?.disconnect();
      groups.clear();
      started = false;
    },
    onElementAdded(element, key) {
      let group = groups.get(key);
      if (!group) {
        group = { elements: new Set() };
        groups.set(key, group);
      }
      group.elements.add(element);
      if (group.observer) group.observer.observe(element);
      else if (started) startGroup(key, group);
    },
    onElementRemoved(element, key) {
      const group = groups.get(key);
      if (!group) return;
      group.elements.delete(element);
      group.observer?.unobserve(element);
      if (group.elements.size > 0) return;
      // The occurrence has no elements left: drop its session without a final event.
      group.observer?.disconnect();
      groups.delete(key);
    },
    async endActive() {
      await Promise.all([...groups.values()].map((group) => group.observer?.endActive()));
    },
  };
}

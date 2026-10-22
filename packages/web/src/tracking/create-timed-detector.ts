import type { TrackingAttribution } from './attribution.js';

import type {
  InteractionDetector,
  InteractionKey,
  ResolveScopeAttribution,
} from './interaction-detector.js';

interface TimedObserver {
  observe(element: Element): void;
  unobserve(element: Element): void;
  disconnect(): void;
  endActive(): Promise<void>;
}

interface CreateTimedDetectorOptions<TInfo, TKey extends InteractionKey> {
  resolveAttribution: ResolveScopeAttribution<TKey>;
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
  getResetToken?: () => unknown;
}

interface Group {
  readonly elements: Set<Element>;
  observer?: TimedObserver;
}

export function createTimedDetector<TInfo, TKey extends InteractionKey = string>({
  resolveAttribution,
  isSupported = () => true,
  isEligible = () => true,
  isFinal,
  createObserver,
  track,
  getResetToken = () => undefined,
}: CreateTimedDetectorOptions<TInfo, TKey>): InteractionDetector<TKey> {
  const groups = new Map<TKey, Group>();
  let started = false;

  const startGroup = (key: TKey, group: Group): void => {
    // A group's callbacks are serialised, so one session is in flight at a time.
    // Its final event keeps the attribution that qualified it: a slow send can
    // delay the final past a `refresh()` that re-points this key.
    let qualified: TrackingAttribution | undefined;
    const resetToken = getResetToken();
    const observer = createObserver(async (info) => {
      // A queued final may outlive disconnect or an explicitly draining session.
      // Only the observer's original owner may authorize that delayed send.
      if (group.observer !== observer || getResetToken() !== resetToken) return;
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
    stop({ preservePending = false } = {}) {
      for (const group of groups.values()) {
        group.observer?.disconnect();
        if (!preservePending) group.observer = undefined;
      }
      groups.clear();
      started = false;
    },
    onElementAdded(element, key) {
      const attribution = resolveAttribution(key);
      if (!attribution || !isEligible(attribution)) return;
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

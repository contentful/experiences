import type { TrackingAttribution } from './attribution.js';

import type { InteractionDetector, ResolveElementAttribution } from './interaction-detector.js';

interface TimedObserver {
  observe(element: Element): void;
  unobserve(element: Element): void;
  disconnect(): void;
  endActive(): Promise<void>;
}

interface CreateTimedDetectorOptions<TInfo> {
  resolveAttribution: ResolveElementAttribution;
  isSupported?: () => boolean;
  isEligible: (attribution: TrackingAttribution) => boolean;
  sessionId: (info: TInfo) => string;
  isFinal: (info: TInfo) => boolean;
  createObserver: (callback: (element: Element, info: TInfo) => Promise<void>) => TimedObserver;
  track: (attribution: TrackingAttribution, info: TInfo) => Promise<void>;
}

export function createTimedDetector<TInfo>({
  resolveAttribution,
  isSupported = () => true,
  isEligible,
  sessionId,
  isFinal,
  createObserver,
  track,
}: CreateTimedDetectorOptions<TInfo>): InteractionDetector {
  const elements = new Set<Element>();
  let observer: TimedObserver | undefined;

  const attributionBySession = new Map<string, TrackingAttribution>();

  const callback = async (element: Element, info: TInfo): Promise<void> => {
    const id = sessionId(info);
    let attribution: TrackingAttribution | undefined;

    if (isFinal(info)) {
      attribution = attributionBySession.get(id) ?? resolveAttribution(element);
      attributionBySession.delete(id);
    } else {
      attribution = resolveAttribution(element);
      if (attribution) attributionBySession.set(id, attribution);
    }

    if (!attribution || !isEligible(attribution)) return;
    await track(attribution, info);
  };

  return {
    start() {
      if (observer || !isSupported()) return;
      observer = createObserver(callback);
      for (const element of elements) observer.observe(element);
    },
    stop() {
      observer?.disconnect();
      observer = undefined;
      elements.clear();
    },
    onElementAdded(element) {
      elements.add(element);
      observer?.observe(element);
    },
    onElementRemoved(element) {
      elements.delete(element);
      observer?.unobserve(element);
    },
    async endActive() {
      await observer?.endActive();
    },
  };
}

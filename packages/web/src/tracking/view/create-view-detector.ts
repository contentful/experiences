import type { ViewBuilderArgs } from '@contentful/experiences-runtime';

import { createTimedDetector } from '../create-timed-detector.js';
import {
  type InteractionDetector,
  type ResolveElementAttribution,
  toInteractionArgs,
} from '../interaction-detector.js';

import type {
  ElementViewCallbackInfo,
  ElementViewObserverOptions,
} from './element-view-observer-support.js';
import { ElementViewObserver } from './element-view-observer.js';

export function createViewDetector(
  trackView: (args: ViewBuilderArgs) => Promise<unknown>,
  resolveAttribution: ResolveElementAttribution,
  options?: ElementViewObserverOptions
): InteractionDetector {
  return createTimedDetector<ElementViewCallbackInfo>({
    resolveAttribution,
    isSupported: () => typeof IntersectionObserver !== 'undefined',
    isEligible: () => true,
    sessionId: (info) => info.viewId,
    isFinal: (info) => info.attempts === 2,
    createObserver: (callback) => new ElementViewObserver(callback, options),
    track: async (attribution, info) => {
      await trackView({
        ...toInteractionArgs(attribution),
        viewId: info.viewId,
        viewDurationMs: Math.max(0, Math.round(info.totalVisibleMs)),
      });
    },
  });
}

import type { ViewBuilderArgs } from '@contentful/experiences-client';

import { createTimedDetector } from '../create-timed-detector.js';
import {
  type InteractionDetector,
  type ResolveElementAttribution,
  sendSafely,
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
    createObserver: (callback) => new ElementViewObserver(callback, options),
    track: (attribution, info) =>
      sendSafely('trackView', attribution, () =>
        trackView({
          ...toInteractionArgs(attribution),
          viewId: info.viewId,
          viewDurationMs: Math.max(0, Math.round(info.totalVisibleMs)),
        })
      ),
  });
}

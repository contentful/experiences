import type { ViewBuilderArgs } from '@contentful/experiences-runtime';

import { createTimedDetector } from '../create-timed-detector.js';
import {
  type InteractionDetector,
  type InteractionKey,
  type ResolveScopeAttribution,
  toInteractionArgs,
} from '../interaction-detector.js';

import type {
  ElementViewCallbackInfo,
  ElementViewObserverOptions,
} from './element-view-observer-support.js';
import { ElementViewObserver } from './element-view-observer.js';

export function createViewDetector<TKey extends InteractionKey = string>(
  trackView: (args: ViewBuilderArgs) => Promise<unknown>,
  resolveAttribution: ResolveScopeAttribution<TKey>,
  options?: ElementViewObserverOptions,
  getResetToken?: () => unknown
): InteractionDetector<TKey> {
  return createTimedDetector<ElementViewCallbackInfo, TKey>({
    resolveAttribution,
    getResetToken,
    isSupported: () => typeof IntersectionObserver !== 'undefined',
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

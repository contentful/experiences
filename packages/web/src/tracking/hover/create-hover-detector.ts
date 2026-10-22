import type { HoverBuilderArgs } from '@contentful/experiences-runtime';

import { createTimedDetector } from '../create-timed-detector.js';
import {
  type InteractionDetector,
  type InteractionKey,
  isFragment,
  type ResolveScopeAttribution,
  toInteractionArgs,
} from '../interaction-detector.js';

import { type ElementHoverCallbackInfo, ElementHoverObserver } from './element-hover-observer.js';

export function createHoverDetector<TKey extends InteractionKey = string>(
  trackHover: (args: HoverBuilderArgs) => Promise<unknown>,
  resolveAttribution: ResolveScopeAttribution<TKey>,
  getResetToken?: () => unknown
): InteractionDetector<TKey> {
  return createTimedDetector<ElementHoverCallbackInfo, TKey>({
    resolveAttribution,
    getResetToken,
    isEligible: isFragment,
    isFinal: (info) => info.attempts === 2,
    createObserver: (callback) => new ElementHoverObserver(callback),
    track: async (attribution, info) => {
      await trackHover({
        ...toInteractionArgs(attribution),
        hoverId: info.hoverId,
        hoverDurationMs: Math.max(0, Math.round(info.totalHoverMs)),
      });
    },
  });
}

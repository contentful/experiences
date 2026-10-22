import type { HoverBuilderArgs } from '@contentful/experiences-runtime';

import { createTimedDetector } from '../create-timed-detector.js';
import {
  type InteractionDetector,
  isFragment,
  type ResolveScopeAttribution,
  toInteractionArgs,
} from '../interaction-detector.js';

import { type ElementHoverCallbackInfo, ElementHoverObserver } from './element-hover-observer.js';

export function createHoverDetector(
  trackHover: (args: HoverBuilderArgs) => Promise<unknown>,
  resolveAttribution: ResolveScopeAttribution,
  getResetToken?: () => unknown
): InteractionDetector {
  return createTimedDetector<ElementHoverCallbackInfo>({
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

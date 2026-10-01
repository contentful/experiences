import type { HoverBuilderArgs } from '@contentful/experiences-client';

import { createTimedDetector } from '../create-timed-detector.js';
import {
  type InteractionDetector,
  isFragment,
  type ResolveElementAttribution,
  toInteractionArgs,
} from '../interaction-detector.js';

import { type ElementHoverCallbackInfo, ElementHoverObserver } from './element-hover-observer.js';

export function createHoverDetector(
  trackHover: (args: HoverBuilderArgs) => Promise<unknown>,
  resolveAttribution: ResolveElementAttribution
): InteractionDetector {
  return createTimedDetector<ElementHoverCallbackInfo>({
    resolveAttribution,
    isEligible: isFragment,
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

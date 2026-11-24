import { afterRenderEffect, computed } from '@angular/core';

import { observePreviewGeometry } from '@contentful/experiences-live-preview';
import type { ExperienceSourceMap } from '@contentful/experiences-sdk-core';

export interface InjectLivePreviewInspectionOptions {
  sourceMap?: ExperienceSourceMap | null;
  enabled?: boolean;
}

export function injectLivePreviewInspection(
  getOptions: () => InjectLivePreviewInspectionOptions
): void {
  const observation = computed(getOptions, {
    equal: (first, second) =>
      first.enabled === second.enabled && first.sourceMap === second.sourceMap,
  });
  afterRenderEffect({
    read(onCleanup) {
      const { sourceMap, enabled } = observation();
      if (enabled) onCleanup(observePreviewGeometry({ sourceMap }));
    },
  });
}

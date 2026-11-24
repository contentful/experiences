import type { ExperienceSourceMap } from '@contentful/experiences-sdk-core';
import { observePreviewGeometry } from '@contentful/experiences-live-preview';

export interface UseLivePreviewInspectionOptions {
  sourceMap?: ExperienceSourceMap | null;
  enabled?: boolean;
}

export function useLivePreviewInspection(getOptions: () => UseLivePreviewInspectionOptions): void {
  $effect(() => {
    const { sourceMap, enabled } = getOptions();
    if (!enabled) return;
    return observePreviewGeometry({ sourceMap });
  });
}

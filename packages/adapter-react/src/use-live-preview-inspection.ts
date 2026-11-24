'use client';

import { useLayoutEffect } from 'react';
import type { ExperienceSourceMap } from '@contentful/experiences-sdk-core';
import { observePreviewGeometry } from '@contentful/experiences-live-preview';

export interface UseLivePreviewInspectionOptions {
  sourceMap?: ExperienceSourceMap | null;
  enabled?: boolean;
}

export function useLivePreviewInspection(options: UseLivePreviewInspectionOptions): void {
  const { sourceMap, enabled = false } = options;
  useLayoutEffect(() => {
    if (!enabled) return;
    return observePreviewGeometry({ sourceMap });
  }, [sourceMap, enabled]);
}

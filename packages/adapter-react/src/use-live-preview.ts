'use client';

import type { ExperiencePayload, PortableRenderPlan } from '@contentful/experiences-sdk-core';
import { useLayoutEffect } from 'react';
import {
  observePreviewGeometry,
  type PreviewSessionOptions,
} from '@contentful/experiences-live-preview';

import { useLivePreviewExperience } from './use-live-preview-experience.js';
import { useExperiencePlan, type ExperiencePlanResolveOptions } from './use-experience-plan.js';

export interface UseLivePreviewOptions {
  previewSessionOptions?: PreviewSessionOptions;
  initialPayload?: ExperiencePayload;
  initialPlan?: PortableRenderPlan;
  /** Enable canvas inspection and request source maps for preview updates. */
  inspector?: boolean;
  resolveOptions: ExperiencePlanResolveOptions;
}

export interface UseLivePreviewResult {
  readonly data: PortableRenderPlan | undefined;
  readonly error: Error | undefined;
}

export function useLivePreview(options: UseLivePreviewOptions): UseLivePreviewResult {
  const livePreview = useLivePreviewExperience({
    previewSessionOptions: options.previewSessionOptions && {
      ...options.previewSessionOptions,
      sourceMap: options.inspector || options.previewSessionOptions.sourceMap,
    },
    initialPayload: options.initialPayload,
  });

  const plan = useExperiencePlan({
    payload: livePreview.data,
    initialPlan: options.initialPlan,
    resolveOptions: options.resolveOptions,
  });

  useLayoutEffect(() => {
    if (!plan.data || !options.inspector) return;
    return observePreviewGeometry(plan.data);
  }, [plan.data, options.inspector]);

  return { data: plan.data, error: livePreview.error };
}

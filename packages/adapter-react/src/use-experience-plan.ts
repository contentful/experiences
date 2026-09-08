'use client';

import { useEffect, useState } from 'react';

import { resolveExperience } from '@contentful/experiences-sdk-core';
import type {
  ExperiencePayload,
  PortableRenderPlan,
  ResolveExperienceOptions,
  ResolverConfig,
} from '@contentful/experiences-sdk-core';

export interface ExperiencePlanResolveOptions extends ResolveExperienceOptions {
  config: ResolverConfig;
}

export interface UseExperiencePlanOptions {
  payload: ExperiencePayload | undefined;
  initialPlan?: PortableRenderPlan;
  resolveOptions: ExperiencePlanResolveOptions;
}

export interface UseExperiencePlanResult {
  readonly data: PortableRenderPlan | undefined;
}

export function useExperiencePlan(options: UseExperiencePlanOptions): UseExperiencePlanResult {
  const { payload, initialPlan, resolveOptions } = options;
  const [plan, setPlan] = useState<PortableRenderPlan | undefined>(initialPlan);
  const { config, metadata, debug, initialViewportId, sourceMap } = resolveOptions;

  useEffect(() => {
    let isCurrent = true;

    if (payload === undefined) {
      return () => {
        isCurrent = false;
      };
    }

    void resolveExperience(payload, config, { metadata, debug, initialViewportId, sourceMap })
      .then((nextPlan) => {
        if (isCurrent && nextPlan.diagnostics.length === 0) {
          setPlan(nextPlan);
        }
      })
      .catch(() => {
        // Keep the last usable experience when resolving an update fails.
      });

    return () => {
      isCurrent = false;
    };
  }, [payload, config, metadata, debug, initialViewportId, sourceMap]);

  return { data: plan };
}

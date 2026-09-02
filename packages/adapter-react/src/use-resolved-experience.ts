'use client';

import { useEffect, useState } from 'react';

import { resolveExperience } from '@contentful/experiences-sdk-core';
import type {
  ExperiencePayload,
  PortableRenderPlan,
  ResolverConfig,
} from '@contentful/experiences-sdk-core';

export interface LivePreviewResolveOptions {
  config: ResolverConfig;
  metadata?: Record<string, unknown>;
  debug?: boolean;
  initialViewportId?: string;
}

export interface UseResolvedExperienceOptions {
  data: ExperiencePayload | undefined;
  initialExperience?: PortableRenderPlan;
  resolveOptions: LivePreviewResolveOptions;
}

export interface UseResolvedExperienceResult {
  readonly data: PortableRenderPlan | undefined;
}

export function useResolvedExperience(
  options: UseResolvedExperienceOptions
): UseResolvedExperienceResult {
  const { data, initialExperience, resolveOptions } = options;
  const [experience, setExperience] = useState<PortableRenderPlan | undefined>(initialExperience);
  const { config, metadata, debug, initialViewportId } = resolveOptions;

  useEffect(() => {
    let isCurrent = true;

    if (data === undefined) {
      return () => {
        isCurrent = false;
      };
    }

    void resolveExperience(data, config, {
      metadata,
      debug,
      initialViewportId,
    })
      .then((nextExperience) => {
        if (isCurrent && nextExperience.diagnostics.length === 0) {
          setExperience(nextExperience);
        }
      })
      .catch(() => {
        // Keep the last usable experience when resolving an update fails.
      });

    return () => {
      isCurrent = false;
    };
  }, [data, config, metadata, debug, initialViewportId]);

  return { data: experience };
}

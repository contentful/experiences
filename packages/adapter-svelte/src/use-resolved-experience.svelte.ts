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
  getOptions: () => UseResolvedExperienceOptions
): UseResolvedExperienceResult {
  let experience = $state<PortableRenderPlan | undefined>(getOptions().initialExperience);

  $effect(() => {
    const { data, resolveOptions } = getOptions();

    if (data === undefined) return;

    let isCurrent = true;
    const { config, metadata, debug, initialViewportId } = resolveOptions;

    void resolveExperience(data, config, {
      metadata,
      debug,
      initialViewportId,
    })
      .then((nextExperience) => {
        if (isCurrent && nextExperience.diagnostics.length === 0) {
          experience = nextExperience;
        }
      })
      .catch(() => {
        // Keep the last usable experience when resolving an update fails.
      });

    return () => {
      isCurrent = false;
    };
  });

  return {
    get data() {
      return experience;
    },
  };
}

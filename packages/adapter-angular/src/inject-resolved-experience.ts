import { type Signal, computed, effect, signal } from '@angular/core';

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

export interface InjectResolvedExperienceOptions {
  data: ExperiencePayload | undefined;
  initialExperience?: PortableRenderPlan;
  resolveOptions: LivePreviewResolveOptions;
}

export interface InjectResolvedExperienceResult {
  readonly data: Signal<PortableRenderPlan | undefined>;
}

type ExperienceUpdateOptions = {
  data: ExperiencePayload | undefined;
  config: ResolverConfig;
  metadata?: Record<string, unknown>;
  debug?: boolean;
  initialViewportId?: string;
};

function areExperienceUpdateOptionsEqual(
  first: ExperienceUpdateOptions,
  second: ExperienceUpdateOptions
): boolean {
  return (
    first.data === second.data &&
    first.config === second.config &&
    first.metadata === second.metadata &&
    first.debug === second.debug &&
    first.initialViewportId === second.initialViewportId
  );
}

export function injectResolvedExperience(
  getOptions: () => InjectResolvedExperienceOptions
): InjectResolvedExperienceResult {
  const currentExperience = signal<PortableRenderPlan | undefined>(undefined);
  const data = computed(() => currentExperience() ?? getOptions().initialExperience);
  const updateOptions = computed<ExperienceUpdateOptions>(
    () => {
      const { data: nextData, resolveOptions } = getOptions();
      const { config, metadata, debug, initialViewportId } = resolveOptions;
      return { data: nextData, config, metadata, debug, initialViewportId };
    },
    { equal: areExperienceUpdateOptionsEqual }
  );

  effect((onCleanup) => {
    const { data: nextData, config, metadata, debug, initialViewportId } = updateOptions();
    if (nextData === undefined) return;

    let isCurrent = true;
    onCleanup(() => {
      isCurrent = false;
    });

    void resolveExperience(nextData, config, {
      metadata,
      debug,
      initialViewportId,
    })
      .then((nextExperience) => {
        if (isCurrent && nextExperience.diagnostics.length === 0) {
          currentExperience.set(nextExperience);
        }
      })
      .catch(() => {
        // Keep the last usable experience when resolving an update fails.
      });
  });

  return { data };
}

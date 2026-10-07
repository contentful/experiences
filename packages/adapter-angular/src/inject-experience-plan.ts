import { type Signal, computed, effect, signal } from '@angular/core';

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

export interface InjectExperiencePlanOptions {
  payload: ExperiencePayload | undefined;
  initialPlan?: PortableRenderPlan;
  resolveOptions: ExperiencePlanResolveOptions;
}

export interface InjectExperiencePlanResult {
  readonly data: Signal<PortableRenderPlan | undefined>;
}

type ExperienceUpdateOptions = {
  payload: ExperiencePayload | undefined;
  config: ResolverConfig;
  metadata?: ResolveExperienceOptions['metadata'];
  debug?: ResolveExperienceOptions['debug'];
  sourceMap?: ResolveExperienceOptions['sourceMap'];
};

function areExperienceUpdateOptionsEqual(
  first: ExperienceUpdateOptions,
  second: ExperienceUpdateOptions
): boolean {
  return (
    first.payload === second.payload &&
    first.config === second.config &&
    first.metadata === second.metadata &&
    first.debug === second.debug &&
    first.sourceMap === second.sourceMap
  );
}

export function injectExperiencePlan(
  getOptions: () => InjectExperiencePlanOptions
): InjectExperiencePlanResult {
  const currentPlan = signal<PortableRenderPlan | undefined>(undefined);
  const data = computed(() => currentPlan() ?? getOptions().initialPlan);
  const updateOptions = computed<ExperienceUpdateOptions>(
    () => {
      const { payload, resolveOptions } = getOptions();
      const { config, metadata, debug, sourceMap } = resolveOptions;
      return { payload, config, metadata, debug, sourceMap };
    },
    { equal: areExperienceUpdateOptionsEqual }
  );

  effect((onCleanup) => {
    const { payload, config, metadata, debug, sourceMap } = updateOptions();
    if (payload === undefined) return;

    let isCurrent = true;
    onCleanup(() => {
      isCurrent = false;
    });

    void resolveExperience(payload, config, { metadata, debug, sourceMap })
      .then((nextPlan) => {
        if (isCurrent && nextPlan.diagnostics.length === 0) {
          currentPlan.set(nextPlan);
        }
      })
      .catch(() => {
        // Keep the last usable experience when resolving an update fails.
      });
  });

  return { data };
}

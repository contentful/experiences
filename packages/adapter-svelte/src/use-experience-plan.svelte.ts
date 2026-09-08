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

export function useExperiencePlan(
  getOptions: () => UseExperiencePlanOptions
): UseExperiencePlanResult {
  let plan = $state<PortableRenderPlan | undefined>(getOptions().initialPlan);

  $effect(() => {
    const { payload, resolveOptions } = getOptions();

    if (payload === undefined) return;

    let isCurrent = true;
    const { config, ...resolveExperienceOptions } = resolveOptions;

    void resolveExperience(payload, config, resolveExperienceOptions)
      .then((nextPlan) => {
        if (isCurrent && nextPlan.diagnostics.length === 0) {
          plan = nextPlan;
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
      return plan;
    },
  };
}

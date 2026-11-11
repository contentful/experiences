'use client';

import type { Config } from '../registry/types.js';
import {
  ClientExperienceRenderer,
  type ClientExperienceRendererProps,
} from '../rendering/client-renderer.js';
import { ExperiencesProvider, ExperiencesRoot } from '../runtime/experiences-provider.js';
import { Experience as ManagedExperience, type ManagedExperienceProps } from './experience.js';
import {
  useManagedExperience as useUnboundManagedExperience,
  type ManagedExperienceOptions,
} from './use-managed-experience.js';

export interface CreateExperiencesOptions {
  readonly config: Config;
}
export type BoundExperienceRendererProps = Omit<ClientExperienceRendererProps, 'config'>;
type WithoutConfig<Props> = Props extends unknown ? Omit<Props, 'config'> : never;
export type BoundManagedExperienceProps = WithoutConfig<ManagedExperienceProps>;
export type BoundManagedExperienceOptions = Omit<ManagedExperienceOptions, 'config'>;

/** Pure registry binding; SDK construction happens only when an owner activates. */
export function createExperiences({ config }: CreateExperiencesOptions) {
  function ExperienceRenderer(props: BoundExperienceRendererProps) {
    return <ClientExperienceRenderer {...props} config={config} />;
  }
  function Experience(props: BoundManagedExperienceProps) {
    return <ManagedExperience {...props} config={config} />;
  }
  function useManagedExperience(options: BoundManagedExperienceOptions) {
    return useUnboundManagedExperience({ ...options, config });
  }
  return {
    ExperiencesRoot,
    ExperiencesProvider,
    ExperienceRenderer,
    Experience,
    useManagedExperience,
  };
}

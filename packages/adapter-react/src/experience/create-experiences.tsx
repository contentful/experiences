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
  type ExperienceNotifications,
} from './use-managed-experience.js';

export interface CreateExperiencesOptions {
  readonly config: Config;
  readonly onRedirect?: ExperienceNotifications['onRedirect'];
}
export type BoundExperienceRendererProps = Omit<ClientExperienceRendererProps, 'config'>;
type WithoutConfig<Props> = Props extends unknown ? Omit<Props, 'config'> : never;
export type BoundManagedExperienceProps = WithoutConfig<ManagedExperienceProps>;
export type BoundManagedExperienceOptions = WithoutConfig<ManagedExperienceOptions>;

/** Pure registry binding; SDK construction happens only when an owner activates. */
export function createExperiences({ config, onRedirect }: CreateExperiencesOptions) {
  function ExperienceRenderer(props: BoundExperienceRendererProps) {
    return <ClientExperienceRenderer {...props} config={config} />;
  }
  function Experience(props: BoundManagedExperienceProps) {
    return (
      <ManagedExperience {...props} onRedirect={props.onRedirect ?? onRedirect} config={config} />
    );
  }
  function useManagedExperience(options: BoundManagedExperienceOptions) {
    return useUnboundManagedExperience({
      ...options,
      onRedirect: options.onRedirect ?? onRedirect,
      config,
    });
  }
  return {
    ExperiencesRoot,
    ExperiencesProvider,
    ExperienceRenderer,
    Experience,
    useManagedExperience,
  };
}

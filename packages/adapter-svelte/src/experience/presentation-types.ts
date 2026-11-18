import type { Snippet } from 'svelte';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import type { DestinationRedirectResult, FetchResolveOptions } from '@contentful/experiences-web';
import type { ClientExperienceRendererProps } from '../rendering/component-props.js';
import type { Config } from '../registry/types.js';
import type { ManagedExperience, ManagedExperienceOptions } from './source-types.js';

export interface ExperienceNotifications {
  onExperienceResolved?: (
    current: ManagedExperience & { readonly data: PortableRenderPlan }
  ) => void;
  onExperienceError?: (error: Error, current: ManagedExperience) => void;
  onRedirect?: (
    redirect: DestinationRedirectResult['redirect'],
    current: ManagedExperience
  ) => void;
}

export type UseManagedExperienceOptions = ManagedExperienceOptions &
  ExperienceNotifications & {
    resolveOptions?: Omit<FetchResolveOptions, 'config'>;
  };

export type ExperienceProps = Partial<UseManagedExperienceOptions> &
  Omit<ClientExperienceRendererProps, 'experience' | 'config'> & {
    config: Config;
    children?: Snippet<[ManagedExperience]>;
    loadingFallback?: Snippet<[ManagedExperience]>;
    errorFallback?: Snippet<[ManagedExperience]>;
  };
export type BoundExperienceProps = Omit<ExperienceProps, 'config'>;

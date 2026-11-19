import type { PresentationNotifications, PresentedExperience } from './presentation.svelte.js';
import type { Snippet } from 'svelte';
import type { FetchResolveOptions } from '@contentful/experiences-web';
import type { ClientExperienceRendererProps } from '../rendering/component-props.js';
import type { ManagedExperienceOperationResult, ManagedExperienceOptions } from './source-types.js';

export type ExperienceNotifications = PresentationNotifications<ManagedExperienceOperationResult>;

export type UseManagedExperienceOptions = ManagedExperienceOptions &
  ExperienceNotifications & {
    resolveOptions?: Omit<FetchResolveOptions, 'config'>;
  };

export type PresentationProps<T> = Omit<ClientExperienceRendererProps, 'experience'> & {
  children?: Snippet<[PresentedExperience<T>]>;
  loadingFallback?: Snippet<[PresentedExperience<T>]>;
  errorFallback?: Snippet<[PresentedExperience<T>]>;
};
export type ExperienceProps = Partial<UseManagedExperienceOptions> &
  PresentationProps<ManagedExperienceOperationResult>;
export type BoundExperienceProps = Omit<ExperienceProps, 'config'>;

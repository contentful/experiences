import type { PresentationSnapshot, PresentedExperience } from './presentation.svelte.js';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import type {
  DestinationRedirectResult,
  FetchExperienceOptions,
  FetchResolveOptions,
} from '@contentful/experiences-web';

export type ManagedExperienceOptions = FetchExperienceOptions & {
  metadata?: FetchResolveOptions['metadata'];
  debug?: boolean;
  initialPlan?: PortableRenderPlan;
  initialError?: Error;
};

/** Personalization for one new browser acquisition of the selected Experience. */
export interface ManagedExperienceAcquireOptions {
  readonly personalization?: FetchExperienceOptions['personalization'];
}

/** Complete local operation outcome; retained presentation never changes this envelope. */
export interface ManagedExperienceOperationResult {
  readonly id: object;
  readonly routeKey?: string;
  readonly request: FetchExperienceOptions;
  readonly plan?: PortableRenderPlan;
  readonly error?: Error;
  readonly notFound?: true;
  readonly redirect?: DestinationRedirectResult['redirect'];
}

export type ManagedExperienceSnapshot = PresentationSnapshot<ManagedExperienceOperationResult>;
export type ManagedExperience = PresentedExperience<ManagedExperienceOperationResult>;

/** Raw selecting input; the primary source owns normalization and runtime applicability. */
export interface SourceOptions {
  readonly request: FetchExperienceOptions;
  readonly resolve: FetchResolveOptions;
  readonly initialPlan?: PortableRenderPlan;
  readonly initialError?: Error;
}

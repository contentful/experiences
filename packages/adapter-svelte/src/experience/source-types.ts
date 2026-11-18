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

export interface ManagedExperienceSnapshot {
  readonly status: 'idle' | 'loading' | 'success' | 'error' | 'redirect';
  readonly data: PortableRenderPlan | undefined;
  readonly error: Error | undefined;
  readonly redirect?: DestinationRedirectResult['redirect'];
  readonly result?: ManagedExperienceOperationResult;
}

export interface ManagedExperience extends ManagedExperienceSnapshot {
  readonly refresh: () => Promise<void>;
  readonly retry: () => Promise<void>;
}

/** Raw selecting input; the primary source owns normalization and runtime applicability. */
export interface SourceOptions {
  readonly request: FetchExperienceOptions;
  readonly resolve: FetchResolveOptions;
  readonly initialPlan?: PortableRenderPlan;
  readonly initialError?: Error;
}

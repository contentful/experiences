import type { Snippet } from 'svelte';
import type {
  Config as WebConfig,
  ContentfulExperiences,
  ExperiencesSnapshot,
} from '@contentful/experiences-web';
import type {
  InjectedOwnerTarget,
  OnStatesReady,
  OwnerTarget,
  RuntimeOwner,
} from './owner-controller.svelte.js';

export type { OnStatesReady } from './owner-controller.svelte.js';

export interface RuntimePresentationProps {
  children?: Snippet;
  snapshot?: ExperiencesSnapshot;
  /** Opaque, committed host route identity. No navigation observer is installed. */
  routeKey?: string;
  onStatesReady?: OnStatesReady;
}

export type ExperiencesRootProps = WebConfig & RuntimePresentationProps;
export interface ExperiencesProviderProps extends RuntimePresentationProps {
  sdk: ContentfulExperiences;
}

/** Internal shared-owner seam for portable and Kit bindings. */
export interface RuntimeRootProps {
  target: OwnerTarget;
  owner?: RuntimeOwner;
  snapshot?: ExperiencesSnapshot;
  children?: Snippet;
  rebindInjected?: (target: InjectedOwnerTarget) => void;
  registerTeardown?: (teardown: () => void) => () => void;
}

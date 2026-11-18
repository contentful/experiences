import type { Presentation } from '../experience/presentation.svelte.js';
import type { Snippet } from 'svelte';
import type { PageSequenceOptions } from './page-sequence.svelte.js';
import type {
  Config as WebConfig,
  ContentfulExperiences,
  ExperiencesSnapshot,
} from '@contentful/experiences-web';
import type { OnStatesReady, RuntimeOwner } from './owner-controller.svelte.js';

export type { OnStatesReady } from './owner-controller.svelte.js';

export interface RuntimePresentationProps extends Pick<
  PageSequenceOptions,
  'initialPagePayload' | 'buildPagePayload' | 'handoff'
> {
  children?: Snippet;
  snapshot?: ExperiencesSnapshot;
  /**
   * Opaque, committed host route identity. With owned Preview, update it on session
   * entry, change and exit; hash routers include pathname + search + hash.
   * No navigation observer is installed.
   */
  routeKey?: string;
  onStatesReady?: OnStatesReady;
}

export type ExperiencesRootProps = WebConfig & RuntimePresentationProps;
export interface ExperiencesProviderProps extends RuntimePresentationProps {
  /** Caller-owned SDK captured during initialization for this activation. */
  sdk: ContentfulExperiences;
}

/** Internal shared-owner seam for portable and Kit bindings. */
export interface RuntimeRootProps extends Omit<
  RuntimePresentationProps,
  'onStatesReady' | 'snapshot'
> {
  owner: RuntimeOwner;
  presentation?: Presentation<unknown>;
  registerTeardown?: (teardown: () => void) => () => void;
}

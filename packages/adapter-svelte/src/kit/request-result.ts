import type {
  ExperiencesHandoff,
  FetchExperienceOptions,
  PreviewConfig,
} from '@contentful/experiences-runtime';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';

/** Preserve the selector family while excluding caller-private personalization. */
export type RequestExperience<E extends FetchExperienceOptions = FetchExperienceOptions> =
  E extends FetchExperienceOptions
    ? Readonly<
        Omit<E, 'personalization'> & {
          /** Explicit absence of page intent; distinct from an event-free operation. */
          personalization?: { readonly events: [] };
        }
      >
    : never;

export type RequestContentErrorKind = 'not-found' | 'preview' | 'authorization' | 'unavailable';
export type RequestPagePayload = import('@contentful/experiences-runtime').PageViewBuilderArgs;

/** One detached, complete operation result for native Kit transport. */
export interface RequestResult<E extends FetchExperienceOptions = FetchExperienceOptions> {
  readonly requestId: string;
  readonly routeKey: string;
  readonly experience: RequestExperience<E>;
  readonly plan?: PortableRenderPlan;
  readonly redirect?: { readonly path: string };
  readonly notFound?: true;
  readonly contentError?: string;
  readonly contentErrorKind?: RequestContentErrorKind;
  readonly handoff?: ExperiencesHandoff;
  readonly initialPageOwner?: 'server';
  readonly initialPagePayload?: RequestPagePayload;
  readonly preview?: Pick<PreviewConfig, 'sessionHost' | 'resourceResolution'>;
  /** Reads/refreshes never recreate visit event intent. */
  readonly eventFree?: boolean;
}

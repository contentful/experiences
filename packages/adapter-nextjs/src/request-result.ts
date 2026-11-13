import type { BrowserConfig } from './browser-config.js';
import type {
  BoundManagedExperienceProps,
  ExperiencesProviderProps,
  ExperiencesRootProps,
} from '@contentful/experiences-react/client';
import type {
  ExperiencesHandoff,
  PortableRenderPlan,
  FetchExperienceOptions,
  Config,
} from '@contentful/experiences-web';

import type { PreviewConfig, PreviewContext } from './preview.js';

type RuntimeIdentity = 'spaceId' | 'environmentId' | 'delivery';

/** Projection retains the selector family, not caller-specific personalization fields. */
export type RequestExperience<E extends FetchExperienceOptions> = E extends { experienceId: string }
  ? Extract<FetchExperienceOptions, { experienceId: string }>
  : E extends { nodeId: string }
    ? Extract<FetchExperienceOptions, { nodeId: string }>
    : Extract<FetchExperienceOptions, { path: string }>;

/** Detached request data shared by the router root and content presentation. */
export interface RequestResult<E extends FetchExperienceOptions = FetchExperienceOptions> {
  readonly requestId: string;
  readonly routeKey: string;
  readonly experience: RequestExperience<E>;
  readonly plan?: PortableRenderPlan;
  readonly redirect?: { readonly path: string };
  readonly contentError?: string;
  readonly handoff?: ExperiencesHandoff;
  /** The server owns the initial attempt, including consent drops and ambiguous failures. */
  readonly initialPageOwner?: 'server';
  readonly initialPagePayload?: ExperiencesRootProps['initialPagePayload'];
  /** Configuration only; the browser derives session and identity from its route and descriptor. */
  readonly preview?: PreviewContext;
}

export type BoundRootProps = Omit<ExperiencesProviderProps, 'sdk'> &
  Partial<Pick<ExperiencesRootProps, RuntimeIdentity | 'defaults' | 'locale'>> & {
    readonly sdk?: ExperiencesProviderProps['sdk'];
    readonly preview?: PreviewConfig;
  };

export type BoundRequestRootProps = Omit<
  BoundRootProps,
  'handoff' | 'handoffKey' | 'snapshot' | 'routeKey' | 'initialPagePayload'
> & { readonly result?: RequestResult };

export type RequestExperienceProps = Omit<
  Extract<BoundManagedExperienceProps, { experienceId: string }>,
  keyof FetchExperienceOptions | 'initialPlan' | 'initialError' | 'resolveOptions'
> & { readonly result?: RequestResult };

/** Plain browser configuration plus server-inherited scope/locale and one whole result. */
export type DefaultRequestRootProps = Omit<
  BoundRequestRootProps,
  RuntimeIdentity | 'defaults' | 'preview'
> &
  Pick<ExperiencesRootProps, 'spaceId' | 'environmentId' | 'locale'> & {
    readonly browser: BrowserConfig;
    readonly defaults?: Pick<NonNullable<Config['defaults']>, 'consent' | 'persistenceConsent'>;
    readonly cookie?: Config['cookie'];
  };

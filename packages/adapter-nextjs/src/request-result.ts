import type { NextjsBrowserConfig } from './browser-config.js';
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

type RuntimeIdentity = 'spaceId' | 'environmentId' | 'delivery';

/** Detached request data shared by the router root and content presentation. */
export interface NextjsRequestResult {
  readonly requestId: string;
  readonly routeKey: string;
  readonly experience: FetchExperienceOptions;
  readonly plan?: PortableRenderPlan;
  readonly contentError?: string;
  readonly handoff?: ExperiencesHandoff;
  readonly initialPagePayload?: ExperiencesRootProps['initialPagePayload'];
}

export type BoundNextjsExperiencesRootProps = Omit<ExperiencesProviderProps, 'sdk'> &
  Partial<
    Pick<
      ExperiencesRootProps,
      RuntimeIdentity | 'defaults' | 'locale' | 'isPreview' | 'livePreview'
    >
  > & {
    readonly sdk?: ExperiencesProviderProps['sdk'];
  };

export type BoundNextjsRequestRootProps = Omit<
  BoundNextjsExperiencesRootProps,
  'handoff' | 'handoffKey' | 'snapshot' | 'routeKey' | 'initialPagePayload'
> & { readonly result?: NextjsRequestResult };

export type NextjsRequestExperienceProps = Omit<
  Extract<BoundManagedExperienceProps, { experienceId: string }>,
  keyof FetchExperienceOptions | 'initialPlan' | 'initialError' | 'resolveOptions'
> & { readonly result: NextjsRequestResult };

/** Plain browser configuration plus server-inherited scope/locale and one whole result. */
export type NextjsDefaultRequestRootProps = Omit<
  BoundNextjsRequestRootProps,
  RuntimeIdentity | 'defaults' | 'isPreview' | 'livePreview'
> &
  Pick<ExperiencesRootProps, 'spaceId' | 'environmentId' | 'locale'> & {
    readonly browser: NextjsBrowserConfig;
    readonly defaults?: Pick<NonNullable<Config['defaults']>, 'consent' | 'persistenceConsent'>;
    readonly cookie?: Config['cookie'];
  };

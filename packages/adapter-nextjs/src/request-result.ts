import type { NextjsBrowserConfig } from './browser-config.js';
import type {
  BoundManagedExperienceProps,
  ExperiencesProviderProps,
  ExperiencesRootProps,
} from '@contentful/experiences-react/client';
import type {
  ExperiencesHandoff,
  PortableRenderPlan,
  RuntimeFetchExperienceOptions,
  ExperiencesWebConfig,
} from '@contentful/experiences-web';

import type { NextjsLivePreviewOptions } from './live-preview.js';

export type NextjsHydrationMode = 'preserve-server' | 'server-only';

type RuntimeIdentity = 'spaceId' | 'environmentId' | 'delivery';

/** Detached request data shared by the router root and content presentation. */
export interface NextjsRequestResult {
  readonly requestId: string;
  readonly routeKey: string;
  readonly experience: RuntimeFetchExperienceOptions;
  readonly plan?: PortableRenderPlan;
  readonly contentError?: string;
  readonly handoff?: ExperiencesHandoff;
  readonly initialPagePayload?: ExperiencesRootProps['initialPagePayload'];
  /** Configuration only; the browser derives session and identity from its route and descriptor. */
  readonly livePreview?: Omit<NextjsLivePreviewOptions, 'loadImplementation' | 'experienceId'>;
}

export type BoundNextjsExperiencesRootProps = Omit<ExperiencesProviderProps, 'sdk'> &
  Partial<Pick<ExperiencesRootProps, RuntimeIdentity | 'defaults' | 'locale' | 'isPreview'>> & {
    readonly sdk?: ExperiencesProviderProps['sdk'];
    readonly livePreview?: ExperiencesRootProps['livePreview'] | NextjsLivePreviewOptions;
    readonly experienceId?: string;
  };

export type BoundNextjsRequestRootProps = Omit<
  BoundNextjsExperiencesRootProps,
  'handoff' | 'snapshot' | 'routeKey' | 'initialPagePayload'
> & { readonly result?: NextjsRequestResult };

export type NextjsRequestExperienceProps = Omit<
  Extract<BoundManagedExperienceProps, { experienceId: string }>,
  keyof RuntimeFetchExperienceOptions | 'initialPlan' | 'initialError' | 'resolveOptions'
> & { readonly result: NextjsRequestResult };

/** Plain browser configuration plus server-inherited scope/locale and one whole result. */
export type NextjsDefaultRequestRootProps = Omit<
  BoundNextjsRequestRootProps,
  RuntimeIdentity | 'defaults' | 'isPreview' | 'livePreview'
> &
  Pick<ExperiencesRootProps, 'spaceId' | 'environmentId' | 'locale'> & {
    readonly browser: NextjsBrowserConfig;
    readonly defaults?: Pick<
      NonNullable<ExperiencesWebConfig['defaults']>,
      'consent' | 'persistenceConsent'
    >;
    readonly cookie?: ExperiencesWebConfig['cookie'];
    readonly experienceId?: string;
  };

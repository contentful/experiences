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

/** Detached request data shared by the router root and content presentation. */
export interface RequestResult {
  readonly requestId: string;
  readonly routeKey: string;
  readonly experience: FetchExperienceOptions;
  readonly plan?: PortableRenderPlan;
  readonly contentError?: string;
  readonly handoff?: ExperiencesHandoff;
  readonly initialPagePayload?: ExperiencesRootProps['initialPagePayload'];
  /** Configuration only; the browser derives session and identity from its route and descriptor. */
  readonly preview?: PreviewContext;
}

export type BoundRootProps = Omit<ExperiencesProviderProps, 'sdk'> &
  Partial<Pick<ExperiencesRootProps, RuntimeIdentity | 'defaults' | 'locale' | 'isPreview'>> & {
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
  RuntimeIdentity | 'defaults' | 'isPreview' | 'preview'
> &
  Pick<ExperiencesRootProps, 'spaceId' | 'environmentId' | 'locale'> & {
    readonly browser: BrowserConfig;
    readonly defaults?: Pick<NonNullable<Config['defaults']>, 'consent' | 'persistenceConsent'>;
    readonly cookie?: Config['cookie'];
  };

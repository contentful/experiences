import type { BrowserConfig } from './browser-config.js';
import type {
  BoundManagedExperienceProps,
  ExperiencesProviderProps,
  ExperiencesRootProps,
  ManagedExperienceKey,
} from '@contentful/experiences-react/client';
import type {
  ExperiencesHandoff,
  ExperienceRequest,
  PortableRenderPlan,
  Config,
} from '@contentful/experiences-web';

import type { PreviewConfig, PreviewContext } from './preview.js';

type RuntimeIdentity = 'spaceId' | 'environmentId' | 'delivery';

/** Detached request data shared by the router root and content presentation. */
export interface RequestResult {
  readonly requestId: string;
  readonly routeKey: string;
  /** The primary selector: an Experience id, Destination path or Destination node. */
  readonly experience: ExperienceRequest;
  readonly plan?: PortableRenderPlan;
  readonly contentError?: string;
  /** The primary Experience, Destination, path or node does not exist; route to 404. */
  readonly notFound?: true;
  /**
   * The Destination redirected. Never content and never navigated by the SDK: the
   * application maps it to a framework redirect. Carries no handoff or page owner.
   */
  readonly redirect?: { readonly path: string };
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
  ManagedExperienceKey
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

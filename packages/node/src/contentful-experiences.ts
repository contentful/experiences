import {
  ContentfulExperiences as ClientContentfulExperiences,
  type ContentfulExperiencesConfig,
  type DestinationRedirectResult,
  type EventBuilderConfig,
  type EventProfile,
  type RuntimeFetchByDestinationNodeOptions,
  type RuntimeFetchByDestinationPathOptions,
  type RuntimeFetchExperienceOptions,
  type RuntimeEventMethods,
  type RuntimeEventBindings,
  type RuntimeResolveOptions,
  type UniversalEventBuilderArgs,
} from '@contentful/experiences-client';
import type { ExperiencePayload, PortableRenderPlan } from '@contentful/experiences-sdk-core';

import { DEFAULT_EVENT_CONTEXT_LIBRARY } from './sdk-info.js';

/**
 * Stable event metadata applied by this SDK instance.
 * Request-sensitive event state is bound by forRequest(), not this long-lived
 * configuration.
 */
export type ExperiencesNodeConfig = Omit<ContentfulExperiencesConfig, 'eventBuilder'> & {
  app?: EventBuilderConfig['app'];
};

/** Context that is scoped to one incoming Node request. */
export type ExperiencesNodeRequestContext = {
  locale?: string;
  resolveOptions?: RuntimeResolveOptions;
  /** Profile state retained only for this request facade and updated by event calls. */
  profile?: EventProfile;
  /** Request-derived event context, such as page and user-agent information. */
  eventContext?: UniversalEventBuilderArgs;
  /** Request-derived consent value used when an event does not supply one. */
  eventConsent?: boolean;
};

type NodeEventMethods = Pick<
  RuntimeEventMethods,
  'identify' | 'page' | 'track' | 'trackView' | 'trackClick' | 'trackHover' | 'trackFlagView'
>;

/**
 * A request-bound facade. This is structural on purpose: callers need only the
 * request-safe operations, rather than the SDK's long-lived client internals.
 */
export interface ExperiencesNodeRequest {
  readonly locale: string | undefined;
  readonly profile: EventProfile | undefined;
  resolveExperience(
    payload: ExperiencePayload,
    resolveOptions?: RuntimeResolveOptions
  ): Promise<PortableRenderPlan>;
  fetchExperience(
    options: RuntimeFetchExperienceOptions,
    resolveOptions?: RuntimeResolveOptions
  ): Promise<PortableRenderPlan>;
  fetchByDestinationNode(
    options: RuntimeFetchByDestinationNodeOptions,
    resolveOptions?: RuntimeResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult>;
  fetchByDestinationPath(
    options: RuntimeFetchByDestinationPathOptions,
    resolveOptions?: RuntimeResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult>;
  identify: NodeEventMethods['identify'];
  page: NodeEventMethods['page'];
  track: NodeEventMethods['track'];
  trackView: NodeEventMethods['trackView'];
  trackClick: NodeEventMethods['trackClick'];
  trackHover: NodeEventMethods['trackHover'];
  trackFlagView: NodeEventMethods['trackFlagView'];
}

/** A Node-oriented runtime whose mutable request state is isolated by forRequest(). */
export class ContentfulExperiences extends ClientContentfulExperiences {
  constructor(config: ExperiencesNodeConfig) {
    const { app, ...clientConfig } = config;
    super({
      ...clientConfig,
      eventBuilder: {
        app,
        channel: 'server',
        library: DEFAULT_EVENT_CONTEXT_LIBRARY,
      },
    });
  }

  forRequest(context: ExperiencesNodeRequestContext = {}): ExperiencesNodeRequest {
    return new RequestBoundExperiences(this, context, (bindings) =>
      this.createEventMethods(bindings)
    );
  }
}

class RequestBoundExperiences implements ExperiencesNodeRequest {
  readonly locale: string | undefined;
  #profile: EventProfile | undefined;

  readonly identify: NodeEventMethods['identify'];
  readonly page: NodeEventMethods['page'];
  readonly track: NodeEventMethods['track'];
  readonly trackView: NodeEventMethods['trackView'];
  readonly trackClick: NodeEventMethods['trackClick'];
  readonly trackHover: NodeEventMethods['trackHover'];
  readonly trackFlagView: NodeEventMethods['trackFlagView'];

  constructor(
    private readonly runtime: ContentfulExperiences,
    private readonly context: ExperiencesNodeRequestContext,
    createEventMethods: (bindings: RuntimeEventBindings) => RuntimeEventMethods
  ) {
    this.locale = context.locale ?? runtime.locale;
    this.#profile = context.profile;

    const methods = createEventMethods({
      getProfile: () => this.#profile,
      setProfile: (profile) => {
        this.#profile = profile;
      },
      getEventContext: () => ({
        ...context.eventContext,
        ...(context.locale === undefined ? {} : { locale: context.locale }),
      }),
      getConsent: () => context.eventConsent,
    });

    this.identify = methods.identify.bind(methods);
    this.page = methods.page.bind(methods);
    this.track = methods.track.bind(methods);
    this.trackView = methods.trackView.bind(methods);
    this.trackClick = methods.trackClick.bind(methods);
    this.trackHover = methods.trackHover.bind(methods);
    this.trackFlagView = methods.trackFlagView.bind(methods);
  }

  get profile(): EventProfile | undefined {
    return this.#profile;
  }

  resolveExperience(
    payload: ExperiencePayload,
    resolveOptions?: RuntimeResolveOptions
  ): Promise<PortableRenderPlan> {
    return this.runtime.resolveExperience(
      payload,
      mergeResolveOptions(this.context.resolveOptions, resolveOptions)
    );
  }

  fetchExperience(
    options: RuntimeFetchExperienceOptions,
    resolveOptions?: RuntimeResolveOptions
  ): Promise<PortableRenderPlan> {
    return this.runtime.fetchExperience(
      { ...options, locale: options.locale ?? this.locale },
      mergeResolveOptions(this.context.resolveOptions, resolveOptions)
    );
  }

  fetchByDestinationNode(
    options: RuntimeFetchByDestinationNodeOptions,
    resolveOptions?: RuntimeResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult> {
    return this.runtime.fetchByDestinationNode(
      options,
      mergeResolveOptions(this.context.resolveOptions, resolveOptions)
    );
  }

  fetchByDestinationPath(
    options: RuntimeFetchByDestinationPathOptions,
    resolveOptions?: RuntimeResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult> {
    return this.runtime.fetchByDestinationPath(
      options,
      mergeResolveOptions(this.context.resolveOptions, resolveOptions)
    );
  }
}

function mergeResolveOptions(
  request: RuntimeResolveOptions | undefined,
  method: RuntimeResolveOptions | undefined
): RuntimeResolveOptions | undefined {
  if (request === undefined && method === undefined) return undefined;

  return {
    metadata: { ...request?.metadata, ...method?.metadata },
    debug: method?.debug ?? request?.debug,
    initialViewportId: method?.initialViewportId ?? request?.initialViewportId,
  };
}

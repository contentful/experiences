import type { DestinationRedirectResult } from '@contentful/experiences-client';
import {
  ContentfulExperiences as RuntimeContentfulExperiences,
  buildPreparedEvents,
  createExperiencesHandoff,
  type ContentfulExperiencesConfig,
  type EventBuilderConfig,
  type EventEmissionResult,
  type EventOptimizationData,
  type EventProfile,
  type ExperiencesHandoff,
  type IdentifyBuilderArgs,
  type InitialPersonalizationEvent,
  type PageViewBuilderArgs,
  type RuntimeEventBindings,
  type RuntimeEventMethods,
  type RuntimeFetchByDestinationNodeOptions,
  type RuntimeFetchByDestinationPathOptions,
  type RuntimeFetchExperienceOptions,
  type RuntimeFetchResolveOptions,
  type RuntimeResolveDefaults,
  type RuntimeResolveOptions,
  type TrackBuilderArgs,
  type UniversalEventBuilderArgs,
} from '@contentful/experiences-runtime';
import type { ExperiencePayload, PortableRenderPlan } from '@contentful/experiences-sdk-core';

import { DEFAULT_EVENT_CONTEXT_LIBRARY } from './sdk-info.js';

/** Stable SDK configuration; request-sensitive values belong to forRequest(). */
export type ExperiencesNodeConfig = Omit<ContentfulExperiencesConfig, 'eventBuilder'> & {
  app?: EventBuilderConfig['app'];
};

/** Context scoped to one incoming Node request. */
export type ExperiencesNodeRequestContext = {
  locale?: string;
  resolveOptions?: RuntimeResolveDefaults & Pick<RuntimeResolveOptions, 'sourceMap'>;
  profile?: EventProfile;
  eventContext?: UniversalEventBuilderArgs;
  /** GDPR metadata on built events; this is not permission to send or persist. */
  eventConsent?: boolean;
};

export type PrepareRequestHandoffOptions = {
  /** Visible pathname plus search, beginning with `/`. */
  readonly routeKey: string;
  readonly initialEvents?: readonly InitialPersonalizationEvent[];
  readonly page?: PageViewBuilderArgs;
};

export type PrepareRequestHandoffResult = {
  /** Private handoff with the exact prepared replay when validation succeeds. */
  readonly handoff: ExperiencesHandoff;
  /** Preflight response; absent on invalid input or preview transport failure. */
  readonly data?: EventOptimizationData;
};

type PreparedPersonalizationEvent = NonNullable<ExperiencesHandoff['replay']>['events'][number];
type PreflightPersonalizationEvents = (
  profileId: string | undefined,
  events: readonly PreparedPersonalizationEvent[],
  locale: string | undefined
) => Promise<EventOptimizationData>;

type NodePersonalizationMethods = {
  identify(args: IdentifyBuilderArgs): Promise<EventEmissionResult>;
  page(args?: PageViewBuilderArgs): Promise<EventEmissionResult>;
  track(args: TrackBuilderArgs): Promise<EventEmissionResult>;
};

type NodeAnalyticsMethods = Pick<
  RuntimeEventMethods,
  'trackView' | 'trackClick' | 'trackHover' | 'trackFlagView'
>;

/** A request-bound facade; many facades may share the one Node SDK instance. */
export interface ExperiencesNodeRequest extends NodePersonalizationMethods, NodeAnalyticsMethods {
  readonly locale: string | undefined;
  readonly profile: EventProfile | undefined;
  resolveExperience(
    payload: ExperiencePayload,
    resolveOptions: RuntimeResolveOptions
  ): Promise<PortableRenderPlan>;
  fetchExperience(
    options: RuntimeFetchExperienceOptions,
    resolveOptions: RuntimeFetchResolveOptions
  ): Promise<PortableRenderPlan>;
  fetchByDestinationNode(
    options: RuntimeFetchByDestinationNodeOptions,
    resolveOptions: RuntimeFetchResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult>;
  fetchByDestinationPath(
    options: RuntimeFetchByDestinationPathOptions,
    resolveOptions: RuntimeFetchResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult>;
  prepareRequestHandoff(
    options: PrepareRequestHandoffOptions
  ): Promise<PrepareRequestHandoffResult>;
}

/** Node SDK with stable transport configuration and request-local event state. */
export class ContentfulExperiences extends RuntimeContentfulExperiences {
  constructor(config: ExperiencesNodeConfig) {
    const { app, ...runtimeConfig } = config;
    super({
      ...runtimeConfig,
      eventBuilder: {
        app,
        channel: 'server',
        library: DEFAULT_EVENT_CONTEXT_LIBRARY,
      },
    });
  }

  forRequest(context: ExperiencesNodeRequestContext = {}): ExperiencesNodeRequest {
    return new RequestBoundExperiences(
      this,
      context,
      (profileId, events, locale) =>
        this.optimizationApi.personalization.upsertProfile(
          { profileId, events: [...events] },
          { locale, preflight: true }
        ),
      (bindings) => this.createEventMethods(bindings)
    );
  }
}

class RequestBoundExperiences implements ExperiencesNodeRequest {
  readonly locale: string | undefined;
  #profile: EventProfile | undefined;
  #profileRevision = 0;

  readonly identify: NodePersonalizationMethods['identify'];
  readonly page: NodePersonalizationMethods['page'];
  readonly track: NodePersonalizationMethods['track'];
  readonly trackView: NodeAnalyticsMethods['trackView'];
  readonly trackClick: NodeAnalyticsMethods['trackClick'];
  readonly trackHover: NodeAnalyticsMethods['trackHover'];
  readonly trackFlagView: NodeAnalyticsMethods['trackFlagView'];

  constructor(
    private readonly runtime: ContentfulExperiences,
    private readonly context: ExperiencesNodeRequestContext,
    private readonly preflightPersonalizationEvents: PreflightPersonalizationEvents,
    createEventMethods: (bindings: RuntimeEventBindings) => RuntimeEventMethods
  ) {
    this.locale = context.locale ?? runtime.locale;
    this.#profile = context.profile;

    const methods = createEventMethods({
      getProfile: () => this.#profile,
      setProfile: (profile) => this.setProfile(profile),
      getProfileRevision: () => this.#profileRevision,
      getLocale: () => this.locale,
      getEventContext: () => this.getRequestEventContext(),
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

  /** Preview one ordered Personalization batch without committing it on the server. */
  async prepareRequestHandoff({
    routeKey,
    initialEvents,
    page,
  }: PrepareRequestHandoffOptions): Promise<PrepareRequestHandoffResult> {
    const incomingProfileId = this.#profile?.id;
    const handoff = createExperiencesHandoff({
      spaceId: this.runtime.spaceId,
      environmentId: this.runtime.environmentId,
      cache: { scope: 'private-request' },
      ...(incomingProfileId === undefined ? {} : { profileId: incomingProfileId }),
    });

    let events: readonly PreparedPersonalizationEvent[];
    try {
      if (!routeKey.startsWith('/')) {
        throw new TypeError('Request handoff requires a pathname/search route key');
      }
      events = buildPreparedEvents({
        eventBuilder: this.runtime.eventBuilder,
        initialEvents,
        page,
        eventContext: this.getRequestEventContext(),
        eventConsent: this.context.eventConsent,
      });
    } catch {
      console.warn(
        '[@contentful/experiences] Invalid request handoff inputs; no replay was prepared.'
      );
      return { handoff };
    }

    const locale = this.locale;
    // The envelope and batch have already been validated; retain the prepared bodies.
    const preparedHandoff: ExperiencesHandoff = {
      ...handoff,
      replay: { routeKey, events, locale },
    };
    const profileRevision = this.#profileRevision;
    try {
      const data = await this.preflightPersonalizationEvents(incomingProfileId, events, locale);
      if (this.#profileRevision === profileRevision) this.setProfile(data.profile);
      return {
        handoff: {
          ...preparedHandoff,
          profileId: incomingProfileId ?? data.profile.id,
        },
        data,
      };
    } catch {
      console.warn(
        '[@contentful/experiences] Request preview failed; prepared replay remains available.'
      );
      return { handoff: preparedHandoff };
    }
  }

  resolveExperience(
    payload: ExperiencePayload,
    resolveOptions: RuntimeResolveOptions
  ): Promise<PortableRenderPlan> {
    return this.runtime.resolveExperience(
      payload,
      mergeResolveOptions(this.context.resolveOptions, resolveOptions)
    );
  }

  async fetchExperience(
    options: RuntimeFetchExperienceOptions,
    resolveOptions: RuntimeFetchResolveOptions
  ): Promise<PortableRenderPlan> {
    const profileRevision = this.#profileRevision;
    const profileId = options.personalization?.profileId ?? this.#profile?.id;
    const resolvedOptions =
      profileId === undefined
        ? options
        : { ...options, personalization: { ...options.personalization, profileId } };
    const plan = await this.runtime.fetchExperience(
      { ...resolvedOptions, locale: options.locale ?? this.locale },
      mergeFetchResolveOptions(this.context.resolveOptions, resolveOptions)
    );
    const returnedProfileId = plan.personalization?.profileId;
    if (returnedProfileId !== undefined && this.#profileRevision === profileRevision) {
      this.setProfile({ id: returnedProfileId });
    }
    return plan;
  }

  fetchByDestinationNode(
    options: RuntimeFetchByDestinationNodeOptions,
    resolveOptions: RuntimeFetchResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult> {
    return this.runtime.fetchByDestinationNode(
      options,
      mergeFetchResolveOptions(this.context.resolveOptions, resolveOptions)
    );
  }

  fetchByDestinationPath(
    options: RuntimeFetchByDestinationPathOptions,
    resolveOptions: RuntimeFetchResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult> {
    return this.runtime.fetchByDestinationPath(
      options,
      mergeFetchResolveOptions(this.context.resolveOptions, resolveOptions)
    );
  }

  private getRequestEventContext(): UniversalEventBuilderArgs {
    return {
      ...this.context.eventContext,
      ...(this.context.locale === undefined ? {} : { locale: this.context.locale }),
    };
  }

  private setProfile(profile: EventProfile): void {
    this.#profile = profile;
    this.#profileRevision += 1;
  }
}

function mergeResolveOptions(
  request: ExperiencesNodeRequestContext['resolveOptions'],
  method: RuntimeResolveOptions
): RuntimeResolveOptions {
  return {
    config: method.config,
    metadata: { ...request?.metadata, ...method?.metadata },
    debug: method?.debug ?? request?.debug,
    sourceMap: method.sourceMap ?? request?.sourceMap,
  };
}

function mergeFetchResolveOptions(
  request: ExperiencesNodeRequestContext['resolveOptions'],
  method: RuntimeFetchResolveOptions
): RuntimeFetchResolveOptions {
  return {
    config: method.config,
    metadata: { ...request?.metadata, ...method.metadata },
    debug: method.debug ?? request?.debug,
  };
}

import {
  serializePersonalization,
  type DestinationRedirectResult,
} from '@contentful/experiences-client';
import {
  ContentfulExperiences as RuntimeContentfulExperiences,
  buildPreparedEvents,
  InterceptorManager,
  validatePersonalizationEvent,
  validatePreparedEvents,
  type OptimizationEventStreamEvent,
  createExperiencesHandoff,
  hasEventConsent,
  hasEventTypeConsent,
  methodForEventType,
  toConsentState,
  type AllowedEventType,
  type BlockedEvent,
  type ConsentInput,
  type ConsentState,
  type ContentfulExperiencesConfig,
  type EventBuilderConfig,
  type EventEmissionResult,
  type EventOptimizationData,
  type EventProfile,
  type ExperienceRequestOptions,
  type ExperiencesHandoff,
  type InsightsRequestOptions,
  type IdentifyBuilderArgs,
  type InitialPersonalizationEvent,
  type PageViewBuilderArgs,
  type RuntimeDirectEventBindings,
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
  /** Event types emitted while event consent is not granted. Defaults to identify and page. */
  allowedEventTypes?: readonly AllowedEventType[];
  /** Called when consent drops an event. Blocked events are never replayed. */
  onEventBlocked?: (event: BlockedEvent) => void;
};

type ConsentPolicy = Pick<ExperiencesNodeConfig, 'allowedEventTypes' | 'onEventBlocked'>;

/** Context scoped to one incoming Node request. */
export type ExperiencesNodeRequestContext = {
  locale?: string;
  resolveOptions?: RuntimeResolveDefaults & Pick<RuntimeResolveOptions, 'sourceMap'>;
  profile?: EventProfile;
  eventContext?: UniversalEventBuilderArgs;
  /**
   * Request-scoped consent: `true` or `false` sets event and persistence consent
   * together, an object sets either independently. Never shared across requests
   * and never persisted; undecided is treated as not granted.
   */
  consent?: ConsentInput;
  /** @deprecated Use `consent.events`. Ignored when `consent.events` is set. */
  eventConsent?: boolean;
  /**
   * Experience API options shared by Personalization calls made through this request, such
   * as the visitor's `ip` (the API otherwise analyses the server's IP). A request `locale`
   * takes precedence over `experienceOptions.locale`.
   */
  experienceOptions?: ExperiencesNodeExperienceOptions;
  /** Insights API options shared by Analytics calls made through this request. */
  insightsOptions?: ExperiencesNodeInsightsOptions;
};

/** Request-bound Experience API options for stateless requests. */
export type ExperiencesNodeExperienceOptions = ExperienceRequestOptions;

/** Request-bound Insights API options for stateless requests. */
export type ExperiencesNodeInsightsOptions = InsightsRequestOptions;

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
  options: ExperienceRequestOptions
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
  /** Whether the host application may persist this request's profile id. */
  readonly canPersistProfile: boolean;
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
export class ContentfulExperiences extends RuntimeContentfulExperiences<
  ExperiencesNodeConfig & Pick<ContentfulExperiencesConfig, 'eventBuilder'>
> {
  readonly #consentPolicy: ConsentPolicy;
  readonly interceptors = { event: new InterceptorManager<OptimizationEventStreamEvent>() };

  constructor(config: ExperiencesNodeConfig) {
    const { app, allowedEventTypes, onEventBlocked } = config;
    super({
      ...config,
      eventBuilder: {
        app,
        channel: 'server',
        library: DEFAULT_EVENT_CONTEXT_LIBRARY,
      },
    });
    this.#consentPolicy = { allowedEventTypes, onEventBlocked };
  }

  forRequest(context: ExperiencesNodeRequestContext = {}): ExperiencesNodeRequest {
    return new RequestBoundExperiences(
      this,
      context,
      (profileId, events, options) =>
        this.api.experience.upsertProfile(
          { profileId, events: [...events] },
          { ...options, preflight: true }
        ),
      (bindings) => this.createEventMethods(bindings),
      this.#consentPolicy
    );
  }
}

class RequestBoundExperiences implements ExperiencesNodeRequest {
  readonly locale: string | undefined;
  #profile: EventProfile | undefined;
  #profileRevision = 0;
  readonly #consent: ConsentState;
  readonly canPersistProfile: boolean;
  /** Copied at construction so a caller mutating the originals cannot leak into this request. */
  readonly #experienceOptions: ExperiencesNodeExperienceOptions | undefined;
  readonly #insightsOptions: ExperiencesNodeInsightsOptions | undefined;
  readonly #personalizationLocale: string | undefined;

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
    createEventMethods: (bindings: RuntimeDirectEventBindings) => RuntimeEventMethods,
    private readonly consentPolicy: ConsentPolicy
  ) {
    const { experienceOptions, insightsOptions } = context;
    this.#experienceOptions =
      experienceOptions === undefined
        ? undefined
        : {
            ip: experienceOptions.ip,
            plainText: experienceOptions.plainText,
            locale: experienceOptions.locale,
          };
    this.#insightsOptions = insightsOptions === undefined ? undefined : { ...insightsOptions };
    // Content locale comes from the request and the runtime default only, as in Optimization's
    // stateless request. `experienceOptions.locale` is a Personalization transport option.
    this.locale = context.locale ?? runtime.locale;
    // Personalization transport locale: the request locale wins over the transport option.
    this.#personalizationLocale =
      context.locale ?? this.#experienceOptions?.locale ?? runtime.locale;
    this.#profile = context.profile;
    const requested = toConsentState(context.consent ?? {});
    this.#consent = { ...requested, events: requested.events ?? context.eventConsent };
    this.canPersistProfile = this.#consent.persistence === true;

    const methods = createEventMethods({
      getProfile: () => this.#profile,
      setProfile: (profile) => this.setProfile(profile),
      getProfileRevision: () => this.#profileRevision,
      getLocale: () => this.#personalizationLocale,
      getEventContext: () => this.getRequestEventContext(),
      getExperienceOptions: () => this.#experienceOptions,
      getInsightsOptions: () => this.#insightsOptions,
      requireProfile: true,
      getConsent: () => this.#consent,
      allowedEventTypes: consentPolicy.allowedEventTypes,
      onEventBlocked: consentPolicy.onEventBlocked,
      eventInterceptors: runtime.interceptors.event,
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
    const profileRevision = this.#profileRevision;
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
      // The initial identify and track inputs are optional, and removing one still
      // leaves a batch that ends in one page, so each is checked on its own. The page is
      // not optional: without a permitted page there is no batch to prepare.
      if (!this.admitMethod('page', page ?? {})) return { handoff };
      events = buildPreparedEvents({
        eventBuilder: this.runtime.eventBuilder,
        initialEvents: initialEvents?.filter((input) => this.admitMethod(input.type, input)),
        page,
        eventContext: this.getRequestEventContext(),
        eventConsent: this.#consent.events === true,
      });
      if (this.runtime.interceptors.event.count() !== 0) {
        const transformed: PreparedPersonalizationEvent[] = [];
        for (const [index, event] of events.entries()) {
          const valid = validatePersonalizationEvent(
            await this.runtime.interceptors.event.run(event)
          );
          if (!this.admitEvent(valid, true)) {
            if (index === events.length - 1) return { handoff };
            continue;
          }
          transformed.push(valid);
        }
        events = validatePreparedEvents(transformed);
      }
    } catch {
      console.warn(
        '[@contentful/experiences] Invalid request handoff inputs; no replay was prepared.'
      );
      return { handoff };
    }

    const locale = this.#personalizationLocale;
    // The envelope and batch have already been validated; retain the prepared bodies.
    const preparedHandoff: ExperiencesHandoff = {
      ...handoff,
      replay: { routeKey, events, locale },
    };
    try {
      const data = await this.preflightPersonalizationEvents(incomingProfileId, events, {
        ...this.#experienceOptions,
        locale,
      });
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
    const incomingProfileId = this.#profile?.id;
    const initiallyGated = this.gatePersonalizationEvents(options);
    const gated =
      this.runtime.interceptors.event.count() === 0
        ? initiallyGated
        : await this.interceptPersonalizationEvents(initiallyGated);
    const profileId = gated.personalization?.profileId ?? incomingProfileId;
    const resolvedOptions =
      profileId === undefined
        ? gated
        : { ...gated, personalization: { ...gated.personalization, profileId } };
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

  /**
   * Drops caller-built XDA events that this request's consent does not admit. The
   * profile id still travels, since it is not an event.
   */
  private gatePersonalizationEvents(
    options: RuntimeFetchExperienceOptions
  ): RuntimeFetchExperienceOptions {
    const events = options.personalization?.events;
    if (events === undefined) return options;

    const admitted = events.filter((event) => this.admitEvent(event));
    return { ...options, personalization: { ...options.personalization, events: admitted } };
  }

  private async interceptPersonalizationEvents(
    options: RuntimeFetchExperienceOptions
  ): Promise<RuntimeFetchExperienceOptions> {
    const personalization = options.personalization;
    if (personalization?.events === undefined) return options;
    const events = await Promise.all(
      personalization.events.map((event) => this.runtime.interceptors.event.run(event))
    );
    const valid = serializePersonalization({ ...personalization, events });
    return {
      ...options,
      personalization: {
        ...valid,
        events: valid.events?.filter((event) => this.admitEvent(event, true)),
      },
    };
  }

  /** Validate the final transport type before applying this request's consent policy. */
  private admitEvent(event: { readonly type: string }, transformed = false): boolean {
    const { allowedEventTypes, onEventBlocked } = this.consentPolicy;
    if (hasEventTypeConsent(event.type, this.#consent, allowedEventTypes)) return true;
    const method = methodForEventType(event.type) ?? (transformed ? event.type : undefined);
    if (method !== undefined) {
      try {
        onEventBlocked?.({ reason: 'consent', method, args: [event] });
      } catch {
        // A failing diagnostic callback must not break event delivery.
      }
    }
    return false;
  }

  /** Whether one prepared method may be sent; reports it to `onEventBlocked` when it may not. */
  private admitMethod(method: 'identify' | 'page' | 'track', args: unknown): boolean {
    const { allowedEventTypes, onEventBlocked } = this.consentPolicy;
    if (hasEventConsent(method, this.#consent, allowedEventTypes)) return true;
    try {
      onEventBlocked?.({ reason: 'consent', method, args: [args] });
    } catch {
      // A failing diagnostic callback must not break event delivery.
    }
    return false;
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

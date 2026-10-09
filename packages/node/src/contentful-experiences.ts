import type { DestinationRedirectResult } from '@contentful/experiences-client';
import {
  ContentfulExperiences as RuntimeContentfulExperiences,
  buildPreparedEvents,
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
export class ContentfulExperiences extends RuntimeContentfulExperiences {
  readonly #consentPolicy: ConsentPolicy;

  constructor(config: ExperiencesNodeConfig) {
    const { app, allowedEventTypes, onEventBlocked, ...runtimeConfig } = config;
    super({
      ...runtimeConfig,
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
      (profileId, events, locale) =>
        this.optimizationApi.personalization.upsertProfile(
          { profileId, events: [...events] },
          { locale, preflight: true }
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
    createEventMethods: (bindings: RuntimeEventBindings) => RuntimeEventMethods,
    private readonly consentPolicy: ConsentPolicy
  ) {
    this.locale = context.locale ?? runtime.locale;
    this.#profile = context.profile;
    const requested = toConsentState(context.consent ?? {});
    this.#consent = { ...requested, events: requested.events ?? context.eventConsent };
    this.canPersistProfile = this.#consent.persistence === true;

    const methods = createEventMethods({
      getProfile: () => this.#profile,
      setProfile: (profile) => this.setProfile(profile),
      getProfileRevision: () => this.#profileRevision,
      getLocale: () => this.locale,
      getEventContext: () => this.getRequestEventContext(),
      getConsent: () => this.#consent,
      allowedEventTypes: consentPolicy.allowedEventTypes,
      onEventBlocked: consentPolicy.onEventBlocked,
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
        eventConsent: this.#consent.events === true,
      });
    } catch {
      console.warn(
        '[@contentful/experiences] Invalid request handoff inputs; no replay was prepared.'
      );
      return { handoff };
    }

    // A prepared batch is identify/track events followed by one page and is replayed
    // as a unit, so it is admitted whole or not at all. Dropping one event would leave
    // a batch the browser rejects.
    if (!this.admitPreparedEvents(events)) return { handoff };

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
    const gated = this.gatePersonalizationEvents(options);
    const profileId = gated.personalization?.profileId ?? this.#profile?.id;
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

    const { allowedEventTypes, onEventBlocked } = this.consentPolicy;
    const admitted = events.filter((event) => {
      if (hasEventTypeConsent(event.type, this.#consent, allowedEventTypes)) return true;
      const method = methodForEventType(event.type);
      if (method === undefined) return false;
      try {
        onEventBlocked?.({ reason: 'consent', method, args: [event] });
      } catch {
        // A failing diagnostic callback must not break event delivery.
      }
      return false;
    });
    return { ...options, personalization: { ...options.personalization, events: admitted } };
  }

  /**
   * Admits a prepared batch only when every event passes; reports each one that does
   * not. A prepared batch is only ever identify and track events plus one page, so
   * each event's type is also the method that would send it.
   */
  private admitPreparedEvents(events: readonly PreparedPersonalizationEvent[]): boolean {
    const { allowedEventTypes, onEventBlocked } = this.consentPolicy;
    let admitted = true;
    for (const event of events) {
      const method = event.type;
      // Fail closed: a type that is not one of the three prepared methods is not admitted.
      const isPreparedMethod = method === 'identify' || method === 'page' || method === 'track';
      if (isPreparedMethod && hasEventConsent(method, this.#consent, allowedEventTypes)) continue;

      admitted = false;
      if (!isPreparedMethod) continue;
      try {
        onEventBlocked?.({ reason: 'consent', method, args: [event] });
      } catch {
        // A failing diagnostic callback must not break event delivery.
      }
    }
    return admitted;
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

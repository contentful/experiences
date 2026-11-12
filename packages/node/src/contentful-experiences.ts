import {
  serializePersonalization,
  type DestinationRedirectResult,
  type PersonalizationOptions as BuiltPersonalizationOptions,
} from '@contentful/experiences-client';
import {
  ContentfulExperiences as RuntimeContentfulExperiences,
  ChangeArray,
  buildFetchPersonalization,
  assertPreviewRequest,
  mergePreviewResolveOptions,
  InterceptorManager,
  withEventConsent,
  type OptimizationEventStreamEvent,
  type FetchExperienceForHandoffResult,
  hasEventTypeConsent,
  methodForEventType,
  toConsentState,
  type AllowedEventType,
  type BlockedEvent,
  type BuiltFetchExperienceOptions,
  type PersonalizationOptions,
  type ConsentInput,
  type ConsentState,
  type Config as BaseConfig,
  type EventBuilder,
  type EventBuilderConfig,
  type EventEmissionResult,
  type EventProfile,
  EventProfileSchema,
  type PersonalizationRequestOptions,
  type ExperiencesHandoff,
  type AnalyticsRequestOptions,
  type IdentifyBuilderArgs,
  type PageViewBuilderArgs,
  type DirectEventBindings,
  type EventMethods,
  type FetchByDestinationNodeOptions,
  type FetchByDestinationPathOptions,
  type FetchExperienceOptions,
  type FetchResolveOptions,
  type ResolveDefaults,
  type ResolveOptions,
  type PreviewSessionOptions,
  type TrackBuilderArgs,
  type UniversalEventBuilderArgs,
} from '@contentful/experiences-runtime';
import type { ExperiencePayload, PortableRenderPlan } from '@contentful/experiences-sdk-core';

import { DEFAULT_EVENT_CONTEXT_LIBRARY } from './sdk-info.js';

type BuiltFetchOptions<T> = Omit<T, 'personalization'> & {
  personalization?: BuiltPersonalizationOptions;
};
type PendingFetchOptions<T> = Omit<T, 'personalization'> & {
  personalization?: ReturnType<typeof buildFetchPersonalization>;
};

/** Stable SDK configuration; request-sensitive values belong to forRequest(). */
export type Config = Omit<BaseConfig, 'eventBuilder'> & {
  app?: EventBuilderConfig['app'];
  /** Event types emitted while event consent is not granted. Defaults to identify and page. */
  allowedEventTypes?: readonly AllowedEventType[];
  /** Called when consent drops an event. Blocked events are never replayed. */
  onEventBlocked?: (event: BlockedEvent) => void;
};

type ConsentPolicy = Pick<Config, 'allowedEventTypes' | 'onEventBlocked'>;

/** Context scoped to one incoming Node request. */
export type RequestContext = {
  /**
   * Default XDA preflight policy for ordinary fetches; defaults to false. Per-call values win.
   * Does not affect event builders, direct event methods, editor preview, or handoff evaluation.
   */
  preflight?: boolean;
  /** Suppresses events for this request. Defaults to false. */
  isPreview?: boolean;
  /** The active editor session for this request; credentials belong to SDK configuration. */
  preview?: PreviewSessionOptions;
  locale?: string;
  resolveOptions?: ResolveDefaults & Pick<ResolveOptions, 'sourceMap'>;
  /** An ID for request continuity or a complete profile snapshot for Analytics. */
  profile?: Pick<EventProfile, 'id'> | EventProfile;
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
   * Personalization API options shared by Personalization calls made through this request, such
   * as the visitor's `ip` (the API otherwise analyses the server's IP). A request `locale`
   * takes precedence over `personalizationOptions.locale`.
   */
  personalizationOptions?: PersonalizationRequestOptions;
  /** Analytics API options shared by Analytics calls made through this request. */
  analyticsOptions?: AnalyticsRequestOptions;
};

export type {
  PersonalizationRequestOptions,
  AnalyticsRequestOptions,
} from '@contentful/experiences-runtime';

type PersonalizationMethods = {
  identify(args: IdentifyBuilderArgs): Promise<EventEmissionResult>;
  page(args?: PageViewBuilderArgs): Promise<EventEmissionResult>;
  track(args: TrackBuilderArgs): Promise<EventEmissionResult>;
};

type AnalyticsMethods = Pick<
  EventMethods,
  'trackView' | 'trackClick' | 'trackHover' | 'trackFlagView'
>;

/** Personalization event construction with request-local context defaults. */
export type RequestEventBuilder = Pick<
  EventBuilder,
  'buildIdentify' | 'buildPageView' | 'buildTrack'
>;

/** A request-bound facade; many facades may share the one Node SDK instance. */
export interface RequestRuntime extends PersonalizationMethods, AnalyticsMethods {
  /** Invalidates unfinished request work without destroying the shared SDK. */
  destroy(): void;
  readonly isPreview: boolean;
  readonly locale: string | undefined;
  readonly profile: RequestContext['profile'];
  /** Builds events without submitting them; explicit inputs override request context. */
  readonly eventBuilder: RequestEventBuilder;
  /** Whether the host application may persist this request's profile id. */
  readonly canPersistProfile: boolean;
  resolveExperience(
    payload: ExperiencePayload,
    resolveOptions: ResolveOptions
  ): Promise<PortableRenderPlan>;
  fetchExperience(
    options: FetchExperienceOptions,
    resolveOptions: FetchResolveOptions
  ): Promise<PortableRenderPlan>;
  /** Evaluates with preflight: true for later browser commitment; rejects explicit false. */
  fetchExperienceForHandoff(
    options: FetchExperienceOptions,
    resolveOptions: FetchResolveOptions,
    replay: { readonly routeKey: string }
  ): Promise<FetchExperienceForHandoffResult>;
  fetchByDestinationNode(
    options: FetchByDestinationNodeOptions,
    resolveOptions: FetchResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult>;
  fetchByDestinationPath(
    options: FetchByDestinationPathOptions,
    resolveOptions: FetchResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult>;
}

/** Node SDK with stable transport configuration and request-local event state. */
export class ContentfulExperiences extends RuntimeContentfulExperiences<
  Config & Pick<BaseConfig, 'eventBuilder'>
> {
  readonly #consentPolicy: ConsentPolicy;
  readonly interceptors = { event: new InterceptorManager<OptimizationEventStreamEvent>() };

  constructor(config: Config) {
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

  forRequest(context: RequestContext = {}): RequestRuntime {
    return new RequestBoundExperiences(
      this,
      context,
      (bindings) => this.createEventMethods(bindings),
      this.#consentPolicy,
      (options, resolveOptions) => this.fetchExperiencePayload(options, resolveOptions),
      (session) => this.fetchPreviewSessionPayload(session)
    );
  }
}

class RequestBoundExperiences implements RequestRuntime {
  readonly #isPreview: boolean;
  readonly #preflight: boolean | undefined;
  readonly locale: string | undefined;
  readonly eventBuilder: RequestEventBuilder;
  #profile: RequestContext['profile'];
  #profileRevision = 0;
  #destroyed = false;
  readonly #previewOptions: PreviewSessionOptions | undefined;
  #previewSnapshot: Promise<ExperiencePayload> | undefined;
  readonly #consent: ConsentState;
  readonly canPersistProfile: boolean;
  /** Copied at construction so a caller mutating the originals cannot leak into this request. */
  readonly #personalizationOptions: PersonalizationRequestOptions | undefined;
  readonly #analyticsOptions: AnalyticsRequestOptions | undefined;
  readonly #personalizationLocale: string | undefined;

  readonly identify: PersonalizationMethods['identify'];
  readonly page: PersonalizationMethods['page'];
  readonly track: PersonalizationMethods['track'];
  readonly trackView: AnalyticsMethods['trackView'];
  readonly trackClick: AnalyticsMethods['trackClick'];
  readonly trackHover: AnalyticsMethods['trackHover'];
  readonly trackFlagView: AnalyticsMethods['trackFlagView'];

  constructor(
    private readonly runtime: ContentfulExperiences,
    private readonly context: RequestContext,
    createEventMethods: (bindings: DirectEventBindings) => EventMethods,
    private readonly consentPolicy: ConsentPolicy,
    private readonly fetchPayload: (
      options: BuiltFetchExperienceOptions,
      resolveOptions: FetchResolveOptions
    ) => Promise<ExperiencePayload>,
    private readonly fetchSessionPayload: (
      session: PreviewSessionOptions
    ) => Promise<ExperiencePayload>
  ) {
    if (context.preflight !== undefined && typeof context.preflight !== 'boolean') {
      throw new TypeError('Request preflight must be a boolean');
    }
    const sessionId = context.preview?.sessionId ?? runtime.config.preview?.sessionId;
    this.#previewOptions = sessionId
      ? {
          sessionId,
          sessionHost: context.preview?.sessionHost ?? runtime.config.preview?.sessionHost,
          resourceResolution:
            context.preview?.resourceResolution ?? runtime.config.preview?.resourceResolution,
        }
      : undefined;
    if (this.#previewOptions !== undefined && context.isPreview === false) {
      throw new TypeError('Preview Session cannot be combined with isPreview: false');
    }
    this.#isPreview = this.#previewOptions !== undefined || context.isPreview === true;
    this.#preflight = context.preflight;
    const { personalizationOptions, analyticsOptions } = context;
    this.#personalizationOptions =
      personalizationOptions === undefined
        ? undefined
        : {
            ip: personalizationOptions.ip,
            plainText: personalizationOptions.plainText,
            locale: personalizationOptions.locale,
          };
    this.#analyticsOptions = analyticsOptions === undefined ? undefined : { ...analyticsOptions };
    // Content locale comes from the request and the runtime default only, as in Optimization's
    // stateless request. `personalizationOptions.locale` is a Personalization transport option.
    this.locale = context.locale ?? runtime.locale;
    // Personalization transport locale: the request locale wins over the transport option.
    this.#personalizationLocale =
      context.locale ?? this.#personalizationOptions?.locale ?? runtime.locale;
    this.#profile = context.profile;
    const requested = toConsentState(context.consent ?? {});
    this.#consent = { ...requested, events: requested.events ?? context.eventConsent };
    this.canPersistProfile = this.#consent.persistence === true;

    this.eventBuilder = {
      buildIdentify: (args) =>
        withEventConsent(
          runtime.eventBuilder.buildIdentify({ ...this.getRequestEventContext(), ...args }),
          this.#consent.events === true
        ),
      buildPageView: (args = {}) =>
        withEventConsent(
          runtime.eventBuilder.buildPageView({ ...this.getRequestEventContext(), ...args }),
          this.#consent.events === true
        ),
      buildTrack: (args) =>
        withEventConsent(
          runtime.eventBuilder.buildTrack({ ...this.getRequestEventContext(), ...args }),
          this.#consent.events === true
        ),
    };

    const eventBindings: DirectEventBindings = {
      getProfile: () => this.#profile,
      getIsPreview: () => this.isPreview,
      setProfile: (profile) => this.setProfile(profile),
      getProfileRevision: () => this.#profileRevision,
      isActive: () => this.isActive(),
      getLocale: () => this.#personalizationLocale,
      getEventContext: () => this.getRequestEventContext(),
      getPersonalizationOptions: () => this.#personalizationOptions,
      getAnalyticsOptions: () => this.#analyticsOptions,
      requireProfile: true,
      getConsent: () => this.#consent,
      allowedEventTypes: consentPolicy.allowedEventTypes,
      onEventBlocked: consentPolicy.onEventBlocked,
      eventInterceptors: runtime.interceptors.event,
    };
    const methods = createEventMethods(eventBindings);

    this.identify = (args) =>
      this.isActive() ? methods.identify(args) : Promise.resolve({ accepted: false });
    this.page = (args) =>
      this.isActive() ? methods.page(args) : Promise.resolve({ accepted: false });
    this.track = (args) =>
      this.isActive() ? methods.track(args) : Promise.resolve({ accepted: false });
    this.trackView = (args) =>
      this.isActive() ? methods.trackView(args) : Promise.resolve({ accepted: false });
    this.trackClick = (args) =>
      this.isActive() ? methods.trackClick(args) : Promise.resolve({ accepted: false });
    this.trackHover = (args) =>
      this.isActive() ? methods.trackHover(args) : Promise.resolve({ accepted: false });
    this.trackFlagView = (args) =>
      this.isActive() ? methods.trackFlagView(args) : Promise.resolve({ accepted: false });
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#previewSnapshot = undefined;
  }

  private isActive(): boolean {
    return !this.#destroyed;
  }

  private assertActive(): void {
    if (!this.isActive()) throw new Error('The Node request has been destroyed');
  }

  get isPreview(): boolean {
    return this.#isPreview;
  }

  get profile(): RequestContext['profile'] {
    return this.#profile;
  }

  async resolveExperience(
    payload: ExperiencePayload,
    resolveOptions: ResolveOptions
  ): Promise<PortableRenderPlan> {
    this.assertActive();
    const plan = await this.runtime.resolveExperience(
      payload,
      mergeResolveOptions(this.context.resolveOptions, resolveOptions)
    );
    this.assertActive();
    return plan;
  }

  async fetchExperience(
    options: FetchExperienceOptions,
    resolveOptions: FetchResolveOptions
  ): Promise<PortableRenderPlan> {
    this.assertActive();
    const resolve = mergeFetchResolveOptions(this.context.resolveOptions, resolveOptions);
    if (this.#previewOptions !== undefined) {
      const plan = await this.fetchPreview(options, resolve);
      if (plan !== undefined) return plan;
    }
    return this.fetchPersonalized(options, (request) =>
      this.runtime.fetchExperience(request, resolve)
    );
  }

  async fetchExperienceForHandoff(
    options: FetchExperienceOptions,
    resolveOptions: FetchResolveOptions,
    replay: { readonly routeKey: string }
  ): Promise<FetchExperienceForHandoffResult> {
    this.assertActive();
    if (
      options.personalization?.preflight !== undefined &&
      options.personalization.preflight !== true
    ) {
      throw new TypeError('Request handoff requires personalization.preflight: true');
    }
    if (typeof replay?.routeKey !== 'string' || !replay.routeKey.startsWith('/')) {
      throw new TypeError('Request handoff requires a pathname/search route key');
    }
    const { routeKey } = replay;
    let handoff: ExperiencesHandoff = {
      spaceId: this.runtime.spaceId,
      environmentId: this.runtime.environmentId,
      cache: { scope: 'private-request' },
    };
    const resolve = mergeFetchResolveOptions(this.context.resolveOptions, resolveOptions);
    if (this.isPreview) {
      return { handoff, plan: await this.fetchExperience(options, resolveOptions) };
    }
    const profileRevision = this.#profileRevision;
    let expectedProfileId = this.#profile?.id;
    const gated = this.gatePersonalizationEvents(options);
    if (gated.personalization !== undefined) {
      gated.personalization = { ...gated.personalization, preflight: true };
    }
    const personalization = gated.personalization;
    let request: BuiltFetchOptions<FetchExperienceOptions>;
    if (this.runtime.interceptors.event.count() > 0 && personalization?.events !== undefined) {
      const events: OptimizationEventStreamEvent[] = [];
      for (const event of personalization.events) {
        this.assertActive();
        events.push(await this.runtime.interceptors.event.run(event));
        this.assertActive();
      }
      request = this.finalizePersonalizationEvents<FetchExperienceOptions>(gated, {
        ...personalization,
        events,
      });
    } else {
      request = this.finalizePersonalizationEvents<FetchExperienceOptions>(gated);
    }
    this.assertActive();
    const profileId = request.personalization?.profileId;
    if (!this.isPreview) {
      handoff = { ...handoff, profileId };
      if (request.personalization?.events?.length) {
        handoff = {
          ...handoff,
          replay: {
            routeKey,
            events: request.personalization.events,
            locale: request.locale ?? this.locale,
          },
        };
      }
    }
    const assertCurrent = () => {
      this.assertActive();
      if (this.#profile?.id !== expectedProfileId && this.#profile?.id !== profileId) {
        throw new Error('Experiences fetch was superseded');
      }
    };
    try {
      assertCurrent();
      const payload = await this.fetchPayload(request, resolve);
      assertCurrent();
      const returnedProfile = payload.extensions?.personalization?.profile;
      if (!this.isPreview && returnedProfile !== undefined) {
        const profile = EventProfileSchema.parse(returnedProfile);
        handoff = { ...handoff, profileId: profile.id, state: { profile } };
        if (this.#profileRevision === profileRevision) {
          this.setProfile(profile);
          expectedProfileId = profile.id;
        }
      }
      const changes = payload.extensions?.personalization?.changes;
      if (!this.isPreview && changes !== undefined) {
        handoff = { ...handoff, state: { ...handoff.state, changes: ChangeArray.parse(changes) } };
      }
      const plan = await this.runtime.resolveExperience(payload, resolve);
      assertCurrent();
      return { handoff, plan };
    } catch (error) {
      assertCurrent();
      return { handoff, error };
    }
  }

  private async fetchPreview(
    options: FetchExperienceOptions,
    resolveOptions: FetchResolveOptions
  ): Promise<PortableRenderPlan | undefined> {
    if (this.#previewOptions === undefined) return undefined;
    const payload = await (this.#previewSnapshot ??= this.fetchSessionPayload(
      this.#previewOptions
    ));
    this.assertActive();
    if (payload.sys?.id !== options.experienceId) return undefined;
    assertPreviewRequest(options);
    this.gatePersonalizationEvents(options);
    this.assertActive();
    const resolve = mergePreviewResolveOptions(this.runtime.config, resolveOptions);
    const plan = await this.runtime.resolveExperience(payload, resolve);
    // Snapshot HTTP cannot be aborted through the package API; discard after disposal.
    this.assertActive();
    return plan;
  }

  fetchByDestinationNode(
    options: FetchByDestinationNodeOptions,
    resolveOptions: FetchResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult> {
    return this.fetchPersonalized(options, (request) =>
      this.runtime.fetchByDestinationNode(
        request,
        mergeFetchResolveOptions(this.context.resolveOptions, resolveOptions)
      )
    );
  }

  fetchByDestinationPath(
    options: FetchByDestinationPathOptions,
    resolveOptions: FetchResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult> {
    return this.fetchPersonalized(options, (request) =>
      this.runtime.fetchByDestinationPath(
        request,
        mergeFetchResolveOptions(this.context.resolveOptions, resolveOptions)
      )
    );
  }

  private async fetchPersonalized<
    TOptions extends { personalization?: PersonalizationOptions; locale?: string },
    TResult extends PortableRenderPlan | DestinationRedirectResult,
  >(
    options: TOptions,
    send: (options: BuiltFetchOptions<TOptions>) => Promise<TResult>
  ): Promise<TResult> {
    this.assertActive();
    const profileRevision = this.#profileRevision;
    const gated = this.gatePersonalizationEvents(options);
    if (gated.personalization !== undefined && this.#preflight !== undefined) {
      gated.personalization = {
        ...gated.personalization,
        preflight:
          gated.personalization.preflight === undefined
            ? this.#preflight
            : gated.personalization.preflight,
      };
    }
    const request =
      this.runtime.interceptors.event.count() === 0
        ? this.finalizePersonalizationEvents<TOptions>(gated)
        : await this.interceptPersonalizationEvents<TOptions>(gated);
    this.assertActive();
    const result = await send(request);
    this.assertActive();
    // A Destination redirect carries no personalization.
    const returnedProfile =
      'personalization' in result ? result.personalization?.profile : undefined;
    if (
      !this.isPreview &&
      returnedProfile !== undefined &&
      this.#profileRevision === profileRevision
    ) {
      this.setProfile(EventProfileSchema.parse(returnedProfile));
    }
    return result;
  }

  /**
   * Drops XDA event intent before building when this request's consent does not admit it. The
   * profile id still travels, since it is not an event.
   */
  private gatePersonalizationEvents<
    T extends { personalization?: PersonalizationOptions; locale?: string },
  >(options: T): PendingFetchOptions<T> {
    const profileId = options.personalization?.profileId ?? this.#profile?.id;
    options = {
      ...options,
      ...('experienceId' in options ? { locale: options.locale ?? this.locale } : {}),
      ...(profileId === undefined
        ? {}
        : { personalization: { ...options.personalization, profileId } }),
    };
    if (this.isPreview) {
      for (const event of options.personalization?.events ?? []) this.admitEvent(event);
      return { ...options, personalization: undefined };
    }
    const personalization =
      options.personalization === undefined
        ? undefined
        : buildFetchPersonalization(
            {
              ...options.personalization,
              events: options.personalization.events?.filter((event) => this.admitEvent(event)),
            },
            this.eventBuilder
          );
    return {
      ...options,
      personalization:
        personalization === undefined
          ? undefined
          : {
              ...personalization,
              events: personalization.events?.map((event) =>
                withEventConsent(event, this.#consent.events === true)
              ),
            },
    };
  }

  private async interceptPersonalizationEvents<T>(
    options: PendingFetchOptions<T>
  ): Promise<BuiltFetchOptions<T>> {
    const personalization = options.personalization;
    if (personalization?.events === undefined)
      return this.finalizePersonalizationEvents<T>(options);
    const events = await Promise.all(
      personalization.events.map((event) => this.runtime.interceptors.event.run(event))
    );
    this.assertActive();
    return this.finalizePersonalizationEvents<T>(options, { ...personalization, events });
  }

  private finalizePersonalizationEvents<T>(
    options: PendingFetchOptions<T>,
    personalization: unknown = options.personalization
  ): BuiltFetchOptions<T> {
    if (personalization === undefined) return { ...options, personalization: undefined };
    const valid = serializePersonalization(personalization);
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
    if (!this.isPreview && hasEventTypeConsent(event.type, this.#consent, allowedEventTypes))
      return true;
    const method = methodForEventType(event.type) ?? (transformed ? event.type : undefined);
    if (method !== undefined) {
      try {
        onEventBlocked?.({ reason: this.isPreview ? 'preview' : 'consent', method, args: [event] });
      } catch {
        // A failing diagnostic callback must not break event delivery.
      }
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
  request: RequestContext['resolveOptions'],
  method: ResolveOptions
): ResolveOptions {
  return {
    ...mergeFetchResolveOptions(request, method),
    sourceMap: method.sourceMap ?? request?.sourceMap,
  };
}

function mergeFetchResolveOptions(
  request: RequestContext['resolveOptions'],
  method: FetchResolveOptions
): FetchResolveOptions {
  return {
    config: method.config,
    metadata: { ...request?.metadata, ...method.metadata },
    debug: method.debug ?? request?.debug,
  };
}

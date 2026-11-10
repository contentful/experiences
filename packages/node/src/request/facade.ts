import { type DestinationRedirectResult } from '@contentful/experiences-client';
import {
  assertPreviewRequest,
  EventProfileSchema,
  fetchPreviewSession,
  initializeLivePreview,
  mergePreviewResolveOptions,
  toConsentState,
  withEventConsent,
  type BuiltFetchExperienceOptions,
  type ConsentState,
  type EventProfile,
  type ExperiencesHandoff,
  type FetchExperienceForHandoffResult,
  type DirectEventBindings,
  type DirectEventMethods,
  type FetchByDestinationNodeOptions,
  type FetchByDestinationPathOptions,
  type FetchExperienceOptions,
  type FetchResolveOptions,
  type LivePreviewBinding,
  type LivePreviewOptions,
  type PersonalizationOptions,
  type ResolveOptions,
  type UniversalEventBuilderArgs,
} from '@contentful/experiences-runtime';
import type { ExperiencePayload, PortableRenderPlan } from '@contentful/experiences-sdk-core';
import { fetchHandoff } from './handoff.js';

import type {
  ConsentPolicy,
  RequestEventBuilder,
  PersonalizationRequestOptions,
  AnalyticsRequestOptions,
  RequestRuntime,
  RequestContext,
  AnalyticsMethods,
  PersonalizationMethods,
} from '../request/types.js';
import type { ContentfulExperiences } from '../sdk/contentful-experiences.js';
import { PersonalizationPreparation, type BuiltFetchOptions } from './personalization.js';
export class RequestBoundExperiences implements RequestRuntime {
  readonly #personalization: PersonalizationPreparation;
  readonly #isPreview: boolean;
  readonly locale: string | undefined;
  readonly eventBuilder: RequestEventBuilder;
  #profile: RequestContext['profile'];
  #profileRevision = 0;
  #destroyed = false;
  readonly #previewOptions: LivePreviewOptions | undefined;
  #previewInitialization: Promise<LivePreviewBinding> | undefined;
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
    createEventMethods: (bindings: DirectEventBindings) => DirectEventMethods,
    consentPolicy: ConsentPolicy,
    private readonly fetchPayload: (
      options: BuiltFetchExperienceOptions,
      resolveOptions: FetchResolveOptions
    ) => Promise<ExperiencePayload>
  ) {
    if (context.livePreview !== undefined && context.isPreview === false) {
      throw new TypeError('livePreview cannot be combined with isPreview: false');
    }
    this.#previewOptions = context.livePreview && { ...context.livePreview };
    this.#isPreview = context.livePreview !== undefined || context.isPreview === true;
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

    this.#personalization = new PersonalizationPreparation({
      getProfile: () => this.profile,
      locale: this.locale,
      isPreview: this.isPreview,
      eventBuilder: this.eventBuilder,
      consent: this.#consent,
      consentPolicy,
      getInterceptors: () => runtime.interceptors.event,
      assertActive: () => this.assertActive(),
    });

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
    this.#previewInitialization = undefined;
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
    if (typeof replay?.routeKey !== 'string' || !replay.routeKey.startsWith('/')) {
      throw new TypeError('Request handoff requires a pathname/search route key');
    }
    const { routeKey } = replay;
    const handoff: ExperiencesHandoff = {
      spaceId: this.runtime.spaceId,
      environmentId: this.runtime.environmentId,
      cache: { scope: 'private-request' },
    };
    const resolve = mergeFetchResolveOptions(this.context.resolveOptions, resolveOptions);
    if (this.#previewOptions !== undefined) {
      const plan = await this.fetchPreview(options, resolve);
      if (plan !== undefined) return { handoff, plan };
    }
    return fetchHandoff(
      this.runtime,
      {
        getProfile: () => this.profile,
        getRevision: () => this.#profileRevision,
        isPreview: this.isPreview,
        locale: this.locale,
        assertActive: () => this.assertActive(),
        setProfile: (profile) => this.setProfile(profile),
      },
      this.#personalization,
      this.fetchPayload,
      options,
      resolve,
      routeKey,
      handoff
    );
  }

  private async fetchPreview(
    options: FetchExperienceOptions,
    resolveOptions: FetchResolveOptions
  ): Promise<PortableRenderPlan | undefined> {
    if (this.#previewOptions?.experienceId !== options.experienceId) return undefined;
    // The matching request shares the approved lazy initialization.
    const binding = await (this.#previewInitialization ??= initializeLivePreview(
      this.#previewOptions
    ));
    this.assertActive();
    assertPreviewRequest(options);
    this.#personalization.gate(options);
    this.assertActive();
    const resolve = mergePreviewResolveOptions(this.runtime.config, resolveOptions);
    const plan = await fetchPreviewSession(binding, this.runtime.config, resolve);
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
    let request = this.#personalization.gate(options);
    request =
      this.runtime.interceptors.event.count() === 0
        ? this.#personalization.finalize(request)
        : await this.#personalization.intercept(request);
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

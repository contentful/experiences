import { type DestinationRedirectResult } from '@contentful/experiences-client';
import {
  assertRuntimePreviewRequest,
  EventProfileSchema,
  fetchRuntimePreviewSession,
  initializeRuntimeLivePreview,
  mergeRuntimePreviewResolveOptions,
  toConsentState,
  withEventConsent,
  type BuiltRuntimeFetchExperienceOptions,
  type ConsentState,
  type EventProfile,
  type ExperiencesHandoff,
  type FetchExperienceForHandoffResult,
  type RuntimeDirectEventBindings,
  type RuntimeEventMethods,
  type RuntimeFetchByDestinationNodeOptions,
  type RuntimeFetchByDestinationPathOptions,
  type RuntimeFetchExperienceOptions,
  type RuntimeFetchResolveOptions,
  type RuntimeLivePreviewBinding,
  type RuntimeLivePreviewOptions,
  type RuntimePersonalizationOptions,
  type RuntimeResolveOptions,
  type UniversalEventBuilderArgs,
} from '@contentful/experiences-runtime';
import type { ExperiencePayload, PortableRenderPlan } from '@contentful/experiences-sdk-core';
import { fetchHandoff } from './handoff.js';

import type {
  ConsentPolicy,
  ExperiencesNodeEventBuilder,
  ExperiencesNodeExperienceOptions,
  ExperiencesNodeInsightsOptions,
  ExperiencesNodeRequest,
  ExperiencesNodeRequestContext,
  NodeAnalyticsMethods,
  NodePersonalizationMethods,
} from '../request/types.js';
import type { ContentfulExperiences } from '../sdk/contentful-experiences.js';
import { RequestPersonalization, type BuiltFetchOptions } from './personalization.js';
export class RequestBoundExperiences implements ExperiencesNodeRequest {
  readonly #personalization: RequestPersonalization;
  readonly #isPreview: boolean;
  readonly locale: string | undefined;
  readonly eventBuilder: ExperiencesNodeEventBuilder;
  #profile: ExperiencesNodeRequestContext['profile'];
  #profileRevision = 0;
  #destroyed = false;
  readonly #previewOptions: RuntimeLivePreviewOptions | undefined;
  #previewInitialization: Promise<RuntimeLivePreviewBinding> | undefined;
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
    createEventMethods: (bindings: RuntimeDirectEventBindings) => RuntimeEventMethods,
    consentPolicy: ConsentPolicy,
    private readonly fetchPayload: (
      options: BuiltRuntimeFetchExperienceOptions,
      resolveOptions: RuntimeFetchResolveOptions
    ) => Promise<ExperiencePayload>
  ) {
    if (context.livePreview !== undefined && context.isPreview === false) {
      throw new TypeError('livePreview cannot be combined with isPreview: false');
    }
    this.#previewOptions = context.livePreview && { ...context.livePreview };
    this.#isPreview = context.livePreview !== undefined || context.isPreview === true;
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

    this.#personalization = new RequestPersonalization({
      getProfile: () => this.profile,
      locale: this.locale,
      isPreview: this.isPreview,
      eventBuilder: this.eventBuilder,
      consent: this.#consent,
      consentPolicy,
      getInterceptors: () => runtime.interceptors.event,
      assertActive: () => this.assertActive(),
    });

    const eventBindings: RuntimeDirectEventBindings = {
      getProfile: () => this.#profile,
      getIsPreview: () => this.isPreview,
      setProfile: (profile) => this.setProfile(profile),
      getProfileRevision: () => this.#profileRevision,
      isActive: () => this.isActive(),
      getLocale: () => this.#personalizationLocale,
      getEventContext: () => this.getRequestEventContext(),
      getExperienceOptions: () => this.#experienceOptions,
      getInsightsOptions: () => this.#insightsOptions,
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

  get profile(): ExperiencesNodeRequestContext['profile'] {
    return this.#profile;
  }

  async resolveExperience(
    payload: ExperiencePayload,
    resolveOptions: RuntimeResolveOptions
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
    options: RuntimeFetchExperienceOptions,
    resolveOptions: RuntimeFetchResolveOptions
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
    options: RuntimeFetchExperienceOptions,
    resolveOptions: RuntimeFetchResolveOptions,
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
    options: RuntimeFetchExperienceOptions,
    resolveOptions: RuntimeFetchResolveOptions
  ): Promise<PortableRenderPlan | undefined> {
    if (this.#previewOptions?.experienceId !== options.experienceId) return undefined;
    // The matching request shares the approved lazy initialization.
    const binding = await (this.#previewInitialization ??= initializeRuntimeLivePreview(
      this.#previewOptions
    ));
    this.assertActive();
    assertRuntimePreviewRequest(options);
    this.#personalization.gate(options);
    this.assertActive();
    const resolve = mergeRuntimePreviewResolveOptions(this.runtime.config, resolveOptions);
    const plan = await fetchRuntimePreviewSession(binding, this.runtime.config, resolve);
    // Snapshot HTTP cannot be aborted through the package API; discard after disposal.
    this.assertActive();
    return plan;
  }

  fetchByDestinationNode(
    options: RuntimeFetchByDestinationNodeOptions,
    resolveOptions: RuntimeFetchResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult> {
    return this.fetchPersonalized(options, (request) =>
      this.runtime.fetchByDestinationNode(
        request,
        mergeFetchResolveOptions(this.context.resolveOptions, resolveOptions)
      )
    );
  }

  fetchByDestinationPath(
    options: RuntimeFetchByDestinationPathOptions,
    resolveOptions: RuntimeFetchResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult> {
    return this.fetchPersonalized(options, (request) =>
      this.runtime.fetchByDestinationPath(
        request,
        mergeFetchResolveOptions(this.context.resolveOptions, resolveOptions)
      )
    );
  }

  private async fetchPersonalized<
    TOptions extends { personalization?: RuntimePersonalizationOptions; locale?: string },
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
  request: ExperiencesNodeRequestContext['resolveOptions'],
  method: RuntimeResolveOptions
): RuntimeResolveOptions {
  return {
    ...mergeFetchResolveOptions(request, method),
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

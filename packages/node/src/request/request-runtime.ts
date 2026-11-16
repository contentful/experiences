import type { DirectEventBindings } from './event-methods.js';
import { assertHandoffRequest, fetchHandoff } from './handoff.js';
import { RequestPersonalization, type BuiltFetchOptions } from './personalization.js';
import {
  assertExperienceSelector,
  type DestinationRedirectResult,
} from '@contentful/experiences-client';
import {
  assertPreviewRequest,
  mergePreviewResolveOptions,
  type FetchExperienceForHandoffResult,
  type BuiltFetchExperienceOptions,
  toConsentState,
  withEventConsent,
  type EventProfile,
  type UniversalEventBuilderArgs,
  type PersonalizationOptions,
  EventProfileSchema,
  type EventMethods,
  type FetchByDestinationNodeOptions,
  type FetchByDestinationPathOptions,
  type FetchExperienceOptions,
  type FetchByIdExperienceOptions,
  type FetchResolveOptions,
  type ResolveOptions,
  type PreviewSessionOptions,
} from '@contentful/experiences-runtime';
import type { ExperiencePayload, PortableRenderPlan } from '@contentful/experiences-sdk-core';

import type { ContentfulExperiences } from '../sdk/contentful-experiences.js';
import type {
  RequestContext,
  RequestRuntime,
  ConsentPolicy,
  RequestEventBuilder,
  PersonalizationMethods,
  AnalyticsMethods,
} from './types.js';
import { mergeResolveOptions, mergeFetchResolveOptions } from './resolve-options.js';

export class RequestBoundExperiences implements RequestRuntime {
  readonly #personalization: RequestPersonalization;
  #previewSnapshot: Promise<ExperiencePayload> | undefined;
  readonly #isPreview: boolean;
  protected readonly preflight: boolean | undefined;
  readonly #previewOptions: PreviewSessionOptions | undefined;
  #profile: RequestContext['profile'];
  #profileRevision = 0;
  #destroyed = false;
  readonly locale: string | undefined;
  readonly eventBuilder: RequestEventBuilder;
  readonly canPersistProfile: boolean;
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
    consentPolicy: ConsentPolicy,
    private readonly fetchPayload: (
      options: BuiltFetchExperienceOptions,
      resolveOptions: FetchResolveOptions
    ) => Promise<ExperiencePayload | DestinationRedirectResult>,
    private readonly fetchSessionPayload: (
      session: PreviewSessionOptions
    ) => Promise<ExperiencePayload>
  ) {
    if (context.preflight !== undefined && typeof context.preflight !== 'boolean') {
      throw new TypeError('Request preflight must be a boolean');
    }
    const sessionId = context.preview?.sessionId.trim();
    this.#previewOptions =
      runtime.config.preview !== undefined && sessionId
        ? {
            sessionId,
            sessionHost: context.preview?.sessionHost ?? runtime.config.preview?.sessionHost,
            resourceResolution:
              context.preview?.resourceResolution ?? runtime.config.preview?.resourceResolution,
          }
        : undefined;
    this.#isPreview = this.#previewOptions !== undefined;
    this.preflight = context.preflight;
    const { personalizationOptions, analyticsOptions } = context;
    const requestPersonalizationOptions =
      personalizationOptions === undefined
        ? undefined
        : {
            ip: personalizationOptions.ip,
            plainText: personalizationOptions.plainText,
            locale: personalizationOptions.locale,
          };
    const requestAnalyticsOptions =
      analyticsOptions === undefined ? undefined : { ...analyticsOptions };
    // Content locale comes from the request and the runtime default only, as in Optimization's
    // stateless request. `personalizationOptions.locale` is a Personalization transport option.
    this.locale = context.locale ?? runtime.locale;
    // Personalization transport locale: the request locale wins over the transport option.
    const requestPersonalizationLocale =
      context.locale ?? requestPersonalizationOptions?.locale ?? runtime.locale;
    this.#profile = this.isPreview ? undefined : context.profile;
    const requested = toConsentState(context.consent ?? {});
    const requestConsent = { ...requested, events: requested.events ?? context.eventConsent };
    this.canPersistProfile = !this.isPreview && requestConsent.persistence === true;
    this.eventBuilder = {
      buildIdentify: (args) =>
        withEventConsent(
          runtime.eventBuilder.buildIdentify({ ...this.getRequestEventContext(), ...args }),
          requestConsent.events === true
        ),
      buildPageView: (args = {}) =>
        withEventConsent(
          runtime.eventBuilder.buildPageView({ ...this.getRequestEventContext(), ...args }),
          requestConsent.events === true
        ),
      buildTrack: (args) =>
        withEventConsent(
          runtime.eventBuilder.buildTrack({ ...this.getRequestEventContext(), ...args }),
          requestConsent.events === true
        ),
    };
    this.#personalization = new RequestPersonalization({
      getProfile: () => this.profile,
      locale: this.locale,
      isPreview: this.isPreview,
      eventBuilder: this.eventBuilder,
      consent: requestConsent,
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
      getLocale: () => requestPersonalizationLocale,
      getEventContext: () => this.getRequestEventContext(),
      getPersonalizationOptions: () => requestPersonalizationOptions,
      getAnalyticsOptions: () => requestAnalyticsOptions,
      getConsent: () => requestConsent,
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
    if (!this.isActive()) return;
    this.#destroyed = true;
    this.#previewSnapshot = undefined;
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

  fetchExperience(
    options: FetchByIdExperienceOptions,
    resolveOptions: FetchResolveOptions
  ): Promise<PortableRenderPlan>;
  fetchExperience(
    options: FetchExperienceOptions,
    resolveOptions: FetchResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult>;
  async fetchExperience(
    options: FetchExperienceOptions,
    resolveOptions: FetchResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult> {
    this.assertActive();
    assertExperienceSelector(options);
    const resolve = mergeFetchResolveOptions(this.context.resolveOptions, resolveOptions);
    if (this.#previewOptions !== undefined && options.experienceId === undefined) {
      const request = this.#personalization.finalize<FetchExperienceOptions>(
        this.#personalization.gate(options)
      );
      const acquired = await this.fetchPayload(request, resolve);
      this.assertActive();
      if ('redirect' in acquired) return acquired;
      if (
        this.runtime.environmentId === 'master' &&
        typeof acquired.sys?.id === 'string' &&
        acquired.sys.id.length > 0
      ) {
        const snapshot = await this.readPreviewSnapshot();
        const load = this.preparePreview(
          snapshot,
          { experienceId: acquired.sys.id, locale: options.locale, extensions: options.extensions },
          resolve
        );
        if (load !== undefined) return load();
      }
      const plan = await this.runtime.resolveExperience(acquired, resolve);
      this.assertActive();
      return plan;
    }
    if (this.#previewOptions !== undefined) {
      const payload = await this.readPreviewSnapshot();
      const load = this.preparePreview(payload, options, resolve);
      if (load !== undefined) return load();
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
    assertExperienceSelector(options);
    assertHandoffRequest(options, replay);
    const { routeKey } = replay;
    const handoff = {
      spaceId: this.runtime.spaceId,
      environmentId: this.runtime.environmentId,
      cache: { scope: 'private-request' as const },
    };
    const resolve = mergeFetchResolveOptions(this.context.resolveOptions, resolveOptions);
    if (this.isPreview && options.experienceId === undefined) {
      try {
        const result = await this.fetchExperience(options, resolve);
        return 'redirect' in result
          ? { handoff, redirect: result.redirect }
          : { handoff, plan: result };
      } catch (error) {
        this.assertActive();
        return { handoff, error };
      }
    }
    if (this.isPreview) {
      let payload: ExperiencePayload;
      try {
        payload = await this.readPreviewSnapshot();
      } catch (error) {
        this.assertActive();
        return { handoff, error };
      }
      // Matching Preview overrides are invocation errors, not content failures.
      const load = this.preparePreview(payload, options, resolve);
      try {
        const plan = await (load !== undefined
          ? load()
          : this.fetchPersonalized(options, (request) =>
              this.runtime.fetchExperience(request, resolve)
            ));
        this.assertActive();
        return 'redirect' in plan ? { handoff, redirect: plan.redirect } : { handoff, plan };
      } catch (error) {
        this.assertActive();
        return { handoff, error };
      }
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

  private readPreviewSnapshot(): Promise<ExperiencePayload> {
    if (this.#previewSnapshot !== undefined) return this.#previewSnapshot;
    const pending = this.fetchSessionPayload(this.#previewOptions!).catch((error: unknown) => {
      if (this.#previewSnapshot === pending) this.#previewSnapshot = undefined;
      this.assertActive();
      throw error;
    });
    return (this.#previewSnapshot = pending);
  }

  private preparePreview(
    payload: ExperiencePayload,
    options: FetchExperienceOptions,
    resolveOptions: FetchResolveOptions
  ): (() => Promise<PortableRenderPlan>) | undefined {
    this.assertActive();
    if (payload.sys?.id !== options.experienceId) return undefined;
    assertPreviewRequest(options);
    this.#personalization.gate(options);
    this.assertActive();
    const resolve = mergePreviewResolveOptions(this.runtime.config, resolveOptions);
    return async () => {
      const plan = await this.runtime.resolveExperience(payload, resolve);
      // Snapshot HTTP cannot be aborted through the package API; discard after disposal.
      this.assertActive();
      return plan;
    };
  }

  fetchByDestinationNode(
    options: FetchByDestinationNodeOptions,
    resolveOptions: FetchResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult> {
    return this.fetchExperience(options, resolveOptions);
  }

  fetchByDestinationPath(
    options: FetchByDestinationPathOptions,
    resolveOptions: FetchResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult> {
    return this.fetchExperience(options, resolveOptions);
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
    const gated = this.#personalization.gate(options);
    if (gated.personalization !== undefined && this.preflight !== undefined) {
      gated.personalization = {
        ...gated.personalization,
        preflight:
          gated.personalization.preflight === undefined
            ? this.preflight
            : gated.personalization.preflight,
      };
    }
    const request =
      this.runtime.interceptors.event.count() === 0
        ? this.#personalization.finalize<TOptions>(gated)
        : await this.#personalization.intercept<TOptions>(gated);
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

  get isPreview(): boolean {
    return this.#isPreview;
  }
  get profile(): RequestContext['profile'] {
    return this.#profile;
  }
  protected isActive(): boolean {
    return !this.#destroyed;
  }
  protected assertActive(): void {
    if (!this.isActive()) throw new Error('The Node request has been destroyed');
  }
  protected getRequestEventContext(): UniversalEventBuilderArgs {
    return {
      ...this.context.eventContext,
      ...(this.context.locale === undefined ? {} : { locale: this.context.locale }),
    };
  }
  protected setProfile(profile: EventProfile): void {
    if (this.isPreview) return;
    this.#profile = profile;
    this.#profileRevision += 1;
  }
}

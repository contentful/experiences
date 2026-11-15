import type { DestinationRedirectResult } from '@contentful/experiences-client';
import type {
  Config as BaseConfig,
  EventBuilderConfig,
  AllowedEventType,
  BlockedEvent,
  PreviewSessionOptions,
  ResolveDefaults,
  ResolveOptions,
  EventProfile,
  UniversalEventBuilderArgs,
  ConsentInput,
  PersonalizationRequestOptions,
  AnalyticsRequestOptions,
  IdentifyBuilderArgs,
  PageViewBuilderArgs,
  TrackBuilderArgs,
  EventEmissionResult,
  EventMethods,
  EventBuilder,
  FetchResolveOptions,
  FetchByIdExperienceOptions,
  FetchExperienceOptions,
  FetchExperienceForHandoffResult,
  FetchByDestinationNodeOptions,
  FetchByDestinationPathOptions,
} from '@contentful/experiences-runtime';
import type { ExperiencePayload, PortableRenderPlan } from '@contentful/experiences-sdk-core';

/** Stable SDK configuration; request-sensitive values belong to forRequest(). */
export type Config = Omit<BaseConfig, 'eventBuilder'> & {
  app?: EventBuilderConfig['app'];
  /** Event types emitted while event consent is not granted. Defaults to identify and page. */
  allowedEventTypes?: readonly AllowedEventType[];
  /** Called when consent drops an event. Blocked events are never replayed. */
  onEventBlocked?: (event: BlockedEvent) => void;
};

export type ConsentPolicy = Pick<Config, 'allowedEventTypes' | 'onEventBlocked'>;

/** Context scoped to one incoming Node request. */
export type RequestContext = {
  /**
   * Default XDA preflight policy for ordinary fetches; defaults to false. Per-call values win.
   * Does not affect event builders, direct event methods, editor preview, or handoff evaluation.
   */
  preflight?: boolean;
  /**
   * The active editor session for this request; credentials belong to SDK configuration.
   * A configured Preview integration and a nonblank Session ID enable preview policy.
   */
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

export type PersonalizationMethods = {
  identify(args: IdentifyBuilderArgs): Promise<EventEmissionResult>;
  page(args?: PageViewBuilderArgs): Promise<EventEmissionResult>;
  track(args: TrackBuilderArgs): Promise<EventEmissionResult>;
};

export type AnalyticsMethods = Pick<
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
  /**
   * Whether the host may persist this request's profile id. Always false in preview;
   * skip cookie writes and expiry when `isPreview`, rather than treating it as withdrawal.
   */
  readonly canPersistProfile: boolean;
  resolveExperience(
    payload: ExperiencePayload,
    resolveOptions: ResolveOptions
  ): Promise<PortableRenderPlan>;
  fetchExperience(
    options: FetchByIdExperienceOptions,
    resolveOptions: FetchResolveOptions
  ): Promise<PortableRenderPlan>;
  fetchExperience(
    options: FetchExperienceOptions,
    resolveOptions: FetchResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult>;
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

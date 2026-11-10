import { type DestinationRedirectResult } from '@contentful/experiences-client';
import {
  type AllowedEventType,
  type BlockedEvent,
  type ConsentInput,
  type ContentfulExperiencesConfig,
  type EventBuilder,
  type EventBuilderConfig,
  type EventEmissionResult,
  type EventProfile,
  type ExperienceRequestOptions,
  type FetchExperienceForHandoffResult,
  type IdentifyBuilderArgs,
  type InsightsRequestOptions,
  type PageViewBuilderArgs,
  type RuntimeEventMethods,
  type RuntimeFetchByDestinationNodeOptions,
  type RuntimeFetchByDestinationPathOptions,
  type RuntimeFetchExperienceOptions,
  type RuntimeFetchResolveOptions,
  type RuntimeLivePreviewOptions,
  type RuntimeResolveDefaults,
  type RuntimeResolveOptions,
  type TrackBuilderArgs,
  type UniversalEventBuilderArgs,
} from '@contentful/experiences-runtime';
import type { ExperiencePayload, PortableRenderPlan } from '@contentful/experiences-sdk-core';

/** Stable SDK configuration; request-sensitive values belong to forRequest(). */
export type ExperiencesNodeConfig = Omit<ContentfulExperiencesConfig, 'eventBuilder'> & {
  app?: EventBuilderConfig['app'];
  /** Event types emitted while event consent is not granted. Defaults to identify and page. */
  allowedEventTypes?: readonly AllowedEventType[];
  /** Called when consent drops an event. Blocked events are never replayed. */
  onEventBlocked?: (event: BlockedEvent) => void;
};

export type ConsentPolicy = Pick<ExperiencesNodeConfig, 'allowedEventTypes' | 'onEventBlocked'>;

/** Context scoped to one incoming Node request. */
export type ExperiencesNodeRequestContext = {
  /** Suppresses events for this request. Defaults to false. */
  isPreview?: boolean;
  /** Binds one Experience to a Preview Session with lazy implementation loading. */
  livePreview?: RuntimeLivePreviewOptions;
  locale?: string;
  resolveOptions?: RuntimeResolveDefaults & Pick<RuntimeResolveOptions, 'sourceMap'>;
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

export type NodePersonalizationMethods = {
  identify(args: IdentifyBuilderArgs): Promise<EventEmissionResult>;
  page(args?: PageViewBuilderArgs): Promise<EventEmissionResult>;
  track(args: TrackBuilderArgs): Promise<EventEmissionResult>;
};

export type NodeAnalyticsMethods = Pick<
  RuntimeEventMethods,
  'trackView' | 'trackClick' | 'trackHover' | 'trackFlagView'
>;

/** Personalization event construction with request-local context defaults. */
export type ExperiencesNodeEventBuilder = Pick<
  EventBuilder,
  'buildIdentify' | 'buildPageView' | 'buildTrack'
>;

/** A request-bound facade; many facades may share the one Node SDK instance. */
export interface ExperiencesNodeRequest extends NodePersonalizationMethods, NodeAnalyticsMethods {
  /** Invalidates unfinished request work without destroying the shared SDK. */
  destroy(): void;
  readonly isPreview: boolean;
  readonly locale: string | undefined;
  readonly profile: ExperiencesNodeRequestContext['profile'];
  /** Builds events without submitting them; explicit inputs override request context. */
  readonly eventBuilder: ExperiencesNodeEventBuilder;
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
  fetchExperienceForHandoff(
    options: RuntimeFetchExperienceOptions,
    resolveOptions: RuntimeFetchResolveOptions,
    replay: { readonly routeKey: string }
  ): Promise<FetchExperienceForHandoffResult>;
  fetchByDestinationNode(
    options: RuntimeFetchByDestinationNodeOptions,
    resolveOptions: RuntimeFetchResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult>;
  fetchByDestinationPath(
    options: RuntimeFetchByDestinationPathOptions,
    resolveOptions: RuntimeFetchResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult>;
}

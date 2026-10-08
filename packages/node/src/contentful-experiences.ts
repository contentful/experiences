import {
  ContentfulExperiences as ClientContentfulExperiences,
  assertRuntimeEventHandoffSize,
  parseRuntimeEventHandoff,
  RUNTIME_EVENT_HANDOFF_VERSION,
  type ContentfulExperiencesConfig,
  type DestinationRedirectResult,
  type EventBuilderConfig,
  type EventOptimizationData,
  type EventProfile,
  type IdentifyBuilderArgs,
  type PageViewBuilderArgs,
  type RuntimeFetchByDestinationNodeOptions,
  type RuntimeFetchByDestinationPathOptions,
  type RuntimeFetchExperienceOptions,
  type RuntimeEventMethods,
  type RuntimeEventBindings,
  type RuntimeEventHandoff,
  type RuntimeResolveOptions,
  type RuntimeServerEventDelivery,
  type TrackBuilderArgs,
  type RuntimeEventHandoffEvent,
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
  /**
   * Server-only event delivery choice. Defaults to direct `commit`; use
   * `handoff` only when a paired Web runtime will commit this request's journal.
   */
  eventDelivery?: RuntimeServerEventDelivery;
};

/** Ordered Personalization command accepted before the initial page preview. */
export type InitialPersonalizationPreviewCommand =
  | ({ readonly type: 'identify' } & Pick<IdentifyBuilderArgs, 'userId' | 'traits'>)
  | ({ readonly type: 'track' } & Pick<TrackBuilderArgs, 'event' | 'properties'>);

/** One-batch Personalization preview that always appends an initial page event. */
export type InitialPersonalizationPreviewOptions = {
  readonly events?: readonly InitialPersonalizationPreviewCommand[];
  readonly page?: Pick<PageViewBuilderArgs, 'properties'>;
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
  /**
   * Preflights and stages an ordered identify/track prefix plus one final page
   * in a single Personalization request. Available only in handoff mode.
   */
  previewInitialPersonalization(
    options?: InitialPersonalizationPreviewOptions
  ): Promise<EventOptimizationData>;
  /**
   * Finalizes the request's handoff journal after all event calls have settled.
   * Returns undefined in commit mode and prohibits later event calls in handoff mode.
   */
  createEventHandoff(options?: { initialPageRouteKey?: string }): RuntimeEventHandoff | undefined;
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
    return new RequestBoundExperiences(
      this,
      context,
      (profileId, events, locale) =>
        this.optimizationApi.personalization.upsertProfile(
          { profileId, events: [...events] },
          { locale, preflight: true }
        ),
      (bindings, dispatch) => this.createEventMethods(bindings, dispatch)
    );
  }
}

class RequestBoundExperiences implements ExperiencesNodeRequest {
  readonly locale: string | undefined;
  #profile: EventProfile | undefined;
  readonly #handoff: EventHandoffCollector | undefined;

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
    preflightPersonalizationEvents: PreflightPersonalizationEvents,
    createEventMethods: (
      bindings: RuntimeEventBindings,
      dispatch?: EventHandoffCollector
    ) => RuntimeEventMethods
  ) {
    this.locale = context.locale ?? runtime.locale;
    this.#profile = context.profile;
    const eventDelivery = context.eventDelivery ?? 'commit';
    if (eventDelivery !== 'commit' && eventDelivery !== 'handoff') {
      throw new TypeError(`Unsupported server event delivery mode: ${String(eventDelivery)}`);
    }
    this.#handoff =
      eventDelivery === 'handoff'
        ? new EventHandoffCollector(
            runtime.spaceId,
            runtime.environmentId,
            context.profile?.id,
            preflightPersonalizationEvents
          )
        : undefined;

    const methods = createEventMethods(
      {
        getProfile: () => this.#profile,
        setProfile: (profile) => {
          this.#profile = profile;
        },
        getEventContext: () => ({
          ...context.eventContext,
          ...(context.locale === undefined ? {} : { locale: context.locale }),
        }),
        getConsent: () => context.eventConsent,
      },
      this.#handoff
    );

    this.identify = methods.identify.bind(methods);
    this.page = methods.page.bind(methods);
    this.track = methods.track.bind(methods);
    this.trackView = methods.trackView.bind(methods);
    this.trackClick = methods.trackClick.bind(methods);
    this.trackHover = methods.trackHover.bind(methods);
    this.trackFlagView = methods.trackFlagView.bind(methods);
  }

  async previewInitialPersonalization(
    options: InitialPersonalizationPreviewOptions = {}
  ): Promise<EventOptimizationData> {
    if (this.#handoff === undefined) {
      throw new Error("previewInitialPersonalization() requires eventDelivery: 'handoff'");
    }

    const events: RuntimePersonalizationHandoffEvent['event'][] = [];
    for (const command of options.events ?? []) {
      if (command.type === 'identify') {
        const { type: _, ...args } = command;
        events.push(
          this.withRequestEventConsent(
            this.runtime.eventBuilder.buildIdentify(this.withRequestEventContext(args))
          )
        );
      } else {
        const { type: _, ...args } = command;
        events.push(
          this.withRequestEventConsent(
            this.runtime.eventBuilder.buildTrack(this.withRequestEventContext(args))
          )
        );
      }
    }
    events.push(
      this.withRequestEventConsent(
        this.runtime.eventBuilder.buildPageView(this.withRequestEventContext(options.page ?? {}))
      )
    );

    const data = await this.#handoff.personalizationBatch(events);
    this.#profile = data.profile;
    return data;
  }

  get profile(): EventProfile | undefined {
    return this.#profile;
  }

  createEventHandoff(
    options: { initialPageRouteKey?: string } = {}
  ): RuntimeEventHandoff | undefined {
    return this.#handoff?.finalize(options.initialPageRouteKey);
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

  private withRequestEventContext<TArgs extends object>(
    args: TArgs
  ): TArgs & UniversalEventBuilderArgs {
    return {
      ...this.context.eventContext,
      ...(this.context.locale === undefined ? {} : { locale: this.context.locale }),
      ...args,
    };
  }

  private withRequestEventConsent<TEvent extends RuntimePersonalizationHandoffEvent['event']>(
    event: TEvent
  ): TEvent {
    if (this.context.eventConsent === undefined) return event;

    return {
      ...event,
      context: {
        ...event.context,
        gdpr: { ...event.context.gdpr, isConsentGiven: this.context.eventConsent },
      },
    } as TEvent;
  }
}

type RuntimePersonalizationHandoffEvent = Extract<
  RuntimeEventHandoffEvent,
  { transport: 'personalization' }
>;
type PreflightPersonalizationEvents = (
  profileId: string | undefined,
  events: readonly RuntimePersonalizationHandoffEvent['event'][],
  locale: string
) => Promise<EventOptimizationData>;

class EventHandoffCollector {
  #finalized = false;
  #pending = false;
  readonly #events: RuntimeEventHandoffEvent[] = [];
  readonly #personalizationEvents: RuntimePersonalizationHandoffEvent['event'][] = [];

  constructor(
    private readonly spaceId: string,
    private readonly environmentId: string,
    private readonly profileId: string | undefined,
    private readonly preflightPersonalizationEvents: PreflightPersonalizationEvents
  ) {}

  async personalization(event: RuntimePersonalizationHandoffEvent['event']) {
    return this.personalizationBatch([event]);
  }

  async personalizationBatch(events: readonly RuntimePersonalizationHandoffEvent['event'][]) {
    this.assertAvailable();
    if (events.length === 0) {
      throw new TypeError('Personalization preview batches cannot be empty');
    }
    const locale = events[0]!.context.locale;
    if (events.some((event) => event.context.locale !== locale)) {
      throw new TypeError('Personalization preview batches require one locale');
    }
    const staged = events.map((event) => ({ transport: 'personalization' as const, event }));
    const candidate = [...this.#events, ...staged];
    assertRuntimeEventHandoffSize(this.candidate(candidate));
    this.#pending = true;
    try {
      const data = await this.preflightPersonalizationEvents(
        this.profileId,
        [...this.#personalizationEvents, ...events],
        locale
      );
      this.#events.push(...staged);
      this.#personalizationEvents.push(...events);
      return data;
    } finally {
      this.#pending = false;
    }
  }

  async analytics(event: Extract<RuntimeEventHandoffEvent, { transport: 'analytics' }>['event']) {
    this.assertAvailable();
    const candidate = [...this.#events, { transport: 'analytics' as const, event }];
    assertRuntimeEventHandoffSize(this.candidate(candidate));
    this.#events.push({ transport: 'analytics', event });
    return true;
  }

  finalize(initialPageRouteKey?: string): RuntimeEventHandoff {
    if (this.#finalized) throw new Error('Event handoff has already been created');
    if (this.#pending) {
      throw new Error('Cannot create an event handoff while staged events are pending');
    }
    const hasPage = this.#events.some(
      (entry) => entry.transport === 'personalization' && entry.event.type === 'page'
    );
    if (hasPage && initialPageRouteKey === undefined) {
      throw new TypeError('Page-bearing event handoffs require initialPageRouteKey');
    }
    const handoff = parseRuntimeEventHandoff(this.candidate(this.#events, initialPageRouteKey));
    this.#finalized = true;
    return handoff;
  }

  private assertAvailable(): void {
    if (this.#pending || this.#finalized) {
      throw new Error('Cannot dispatch events while handoff is pending or finalized');
    }
  }

  private candidate(
    events: readonly RuntimeEventHandoffEvent[],
    initialPageRouteKey?: string
  ): RuntimeEventHandoff {
    return {
      version: RUNTIME_EVENT_HANDOFF_VERSION,
      spaceId: this.spaceId,
      environmentId: this.environmentId,
      ...(this.profileId === undefined ? {} : { initialProfileId: this.profileId }),
      events,
      ...(initialPageRouteKey === undefined ? {} : { initialPageRouteKey }),
    };
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
  };
}

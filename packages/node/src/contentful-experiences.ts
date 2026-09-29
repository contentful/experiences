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
  type RuntimeFetchByDestinationNodeOptions,
  type RuntimeFetchByDestinationPathOptions,
  type RuntimeFetchExperienceOptions,
  type RuntimeEventMethods,
  type RuntimeEventBindings,
  type RuntimeEventHandoff,
  type RuntimeResolveOptions,
  type RuntimeServerEventDelivery,
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
        this.optimizationApi.experience.upsertProfile(
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
    preflightExperienceEvents: PreflightExperienceEvents,
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
            preflightExperienceEvents
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
}

type RuntimeExperienceHandoffEvent = Extract<RuntimeEventHandoffEvent, { transport: 'experience' }>;
type PreflightExperienceEvents = (
  profileId: string | undefined,
  events: readonly RuntimeExperienceHandoffEvent['event'][],
  locale: string
) => Promise<EventOptimizationData>;

class EventHandoffCollector {
  #finalized = false;
  #pending = false;
  readonly #events: RuntimeEventHandoffEvent[] = [];
  readonly #experienceEvents: RuntimeExperienceHandoffEvent['event'][] = [];

  constructor(
    private readonly spaceId: string,
    private readonly environmentId: string,
    private readonly profileId: string | undefined,
    private readonly preflightExperienceEvents: PreflightExperienceEvents
  ) {}

  async experience(event: RuntimeExperienceHandoffEvent['event']) {
    this.assertAvailable();
    const candidate = [...this.#events, { transport: 'experience' as const, event }];
    assertRuntimeEventHandoffSize(this.candidate(candidate));
    this.#pending = true;
    try {
      const data = await this.preflightExperienceEvents(
        this.profileId,
        [...this.#experienceEvents, event],
        event.context.locale
      );
      this.#events.push({ transport: 'experience', event });
      this.#experienceEvents.push(event);
      return data;
    } finally {
      this.#pending = false;
    }
  }

  async insights(event: Extract<RuntimeEventHandoffEvent, { transport: 'insights' }>['event']) {
    this.assertAvailable();
    const candidate = [...this.#events, { transport: 'insights' as const, event }];
    assertRuntimeEventHandoffSize(this.candidate(candidate));
    this.#events.push({ transport: 'insights', event });
    return true;
  }

  finalize(initialPageRouteKey?: string): RuntimeEventHandoff {
    if (this.#finalized) throw new Error('Event handoff has already been created');
    if (this.#pending) {
      throw new Error('Cannot create an event handoff while staged events are pending');
    }
    const hasPage = this.#events.some(
      (entry) => entry.transport === 'experience' && entry.event.type === 'page'
    );
    const handoff = parseRuntimeEventHandoff(
      this.candidate(this.#events, hasPage ? initialPageRouteKey : undefined)
    );
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
    initialViewportId: method?.initialViewportId ?? request?.initialViewportId,
  };
}

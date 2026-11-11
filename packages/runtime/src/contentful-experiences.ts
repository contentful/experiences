import {
  ContentfulViewDeliveryClient,
  createUserAgentHeaders,
  fetchExperience,
  PREVIEW_HOST,
  type DestinationRedirectResult,
  type ExperienceRequestExtensions,
  type ExperienceParameters,
  type PersonalizationOptions,
} from '@contentful/experiences-client';
import { resolveExperience as resolveCoreExperience } from '@contentful/experiences-sdk-core';
import type {
  ExperiencePayload,
  ExperienceSourceMap,
  PortableRenderPlan,
  ResolverConfig,
} from '@contentful/experiences-sdk-core';
import EventBuilder from './event-builder.js';
import type { EventBuilderConfig } from './event-builder.js';
import type { Json } from '@contentful/optimization-api-client/api-schemas';
import { resolveFlagChange } from './resolve-flag-change.js';
import {
  createRuntimeDeliveryClient,
  type DeliveryClientOptions,
} from './create-runtime-delivery-client.js';
import {
  createRuntimeOptimizationClient,
  type ApiClient,
  type OptimizationConfig,
} from './create-optimization-client.js';
import { DEFAULT_EVENT_CONTEXT_LIBRARY } from './sdk-info.js';
import {
  createRuntimeEventMethods,
  type RuntimeEventBindings,
  type DirectEventBindings,
  type RuntimeEventDispatch,
  type RuntimeEventMethods,
} from './runtime-event-methods.js';

export type ResolveOptions = {
  config: ResolverConfig;
  metadata?: Record<string, unknown>;
  debug?: boolean;
  /**
   * Source map for `resolveExperience`. Wins over the payload's own
   * `extensions.sourceMap`. Not accepted by fetch methods, which use the map
   * from their own response.
   */
  sourceMap?: ExperienceSourceMap;
};

/**
 * Resolve options for the fetch methods. A fetch takes its source map from its
 * own response, so `sourceMap` is not accepted here.
 */
export type FetchResolveOptions = Omit<ResolveOptions, 'sourceMap'>;
/** Metadata/debug may be shared, while registrations remain per resolution. */
export type ResolveDefaults = Pick<ResolveOptions, 'metadata' | 'debug'>;

export type EventBuilderOptions = Omit<EventBuilderConfig, 'channel' | 'library'> & {
  channel: EventBuilderConfig['channel'];
  library?: Partial<EventBuilderConfig['library']>;
};

export type FetchExperienceOptions = {
  experienceId: string;
  locale?: string;
  parameters?: ExperienceParameters;
  personalization?: PersonalizationOptions;
  extensions?: ExperienceRequestExtensions;
  preview?: boolean;
};

export type FetchByDestinationNodeOptions = {
  destinationId: string;
  nodeId: string;
  personalization?: PersonalizationOptions;
};

export type FetchByDestinationPathOptions = {
  destinationId: string;
  path: string;
  personalization?: PersonalizationOptions;
};

/** Structural contract implemented by the shared runtime. */
export interface ExperienceRuntime {
  readonly spaceId: string;
  readonly environmentId: string;
  readonly locale: string | undefined;
  readonly eventBuilder: EventBuilder;
  destroy(): void;
  resolveExperience(
    payload: ExperiencePayload,
    resolveOptions: ResolveOptions
  ): Promise<PortableRenderPlan>;
  fetchExperience(
    options: FetchExperienceOptions,
    resolveOptions: FetchResolveOptions
  ): Promise<PortableRenderPlan>;
  fetchByDestinationNode(
    options: FetchByDestinationNodeOptions,
    resolveOptions: FetchResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult>;
  fetchByDestinationPath(
    options: FetchByDestinationPathOptions,
    resolveOptions: FetchResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult>;
}

export type Config = {
  spaceId: string;
  environmentId: string;
  locale?: string;
  /** Configuration for the runtime-owned Content Delivery API client. */
  delivery: DeliveryClientOptions;
  /** Optional configuration for the runtime-owned Content Preview API client. */
  preview?: DeliveryClientOptions;
  /** Overrides for the runtime-owned Personalization and Analytics event transport. */
  optimization?: OptimizationConfig;
  resolveDefaults?: ResolveDefaults;
  eventBuilder: EventBuilderOptions;
};

export class ContentfulExperiences<TConfig extends Config = Config> implements ExperienceRuntime {
  readonly config: TConfig;
  readonly api: ApiClient;
  readonly spaceId: string;
  readonly environmentId: string;
  readonly eventBuilder: EventBuilder;

  readonly #locale: string | undefined;
  readonly #deliveryClient: ContentfulViewDeliveryClient;
  readonly #previewClient: ContentfulViewDeliveryClient | undefined;
  readonly #resolveDefaults: ResolveDefaults;
  #destroyed = false;

  constructor(config: TConfig) {
    this.config = config;
    this.spaceId = config.spaceId;
    this.environmentId = config.environmentId;
    this.#locale = config.locale;
    const library = { ...DEFAULT_EVENT_CONTEXT_LIBRARY, ...config.eventBuilder.library };
    const userAgentHeaders = createUserAgentHeaders(library, config.eventBuilder.app);
    const identity = { spaceId: config.spaceId, environmentId: config.environmentId };
    this.#deliveryClient = createRuntimeDeliveryClient(
      config.delivery,
      identity,
      undefined,
      userAgentHeaders
    );
    this.#previewClient =
      config.preview === undefined
        ? undefined
        : createRuntimeDeliveryClient(config.preview, identity, PREVIEW_HOST, userAgentHeaders);
    this.api = createRuntimeOptimizationClient({
      spaceId: config.spaceId,
      environmentId: config.environmentId,
      locale: config.locale,
      ...config.optimization,
    });
    this.#resolveDefaults = config.resolveDefaults ?? {};

    this.eventBuilder = new EventBuilder({
      ...config.eventBuilder,
      library,
      getLocale: config.eventBuilder.getLocale ?? (() => this.locale),
    });
  }

  /** Mark this runtime unusable. Leaf runtimes release their owned resources first. */
  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
  }

  get locale(): string | undefined {
    return this.#locale;
  }

  /** Pure lookup in caller-owned changes; no state is retained or exposure emitted. */
  getFlag(name: string, changes?: readonly unknown[]): Json | undefined {
    return resolveFlagChange(name, changes)?.value;
  }

  protected createEventMethods(
    ...args:
      | [bindings: DirectEventBindings]
      | [bindings: RuntimeEventBindings, dispatch: RuntimeEventDispatch]
  ): RuntimeEventMethods {
    if (args.length === 1) {
      return createRuntimeEventMethods(this.api, this.eventBuilder, {
        getLocale: () => this.locale,
        ...args[0],
      });
    }
    return createRuntimeEventMethods(
      this.api,
      this.eventBuilder,
      { getLocale: () => this.locale, ...args[0] },
      args[1]
    );
  }

  resolveExperience(
    payload: ExperiencePayload,
    resolveOptions: ResolveOptions
  ): Promise<PortableRenderPlan> {
    return resolveCoreExperience(
      payload,
      requireResolverConfig(resolveOptions),
      this.#mergeResolveOptions(resolveOptions)
    );
  }

  fetchExperience(
    options: FetchExperienceOptions,
    resolveOptions: FetchResolveOptions
  ): Promise<PortableRenderPlan> {
    if (options.preview === true && this.#previewClient === undefined) {
      throw new Error(
        'fetchExperience() called with preview: true but this runtime has no preview client'
      );
    }
    const resolverConfig = requireResolverConfig(resolveOptions);
    return fetchExperience(
      {
        spaceId: this.spaceId,
        environmentId: this.environmentId,
        experienceId: options.experienceId,
        locale: options.locale ?? this.locale,
        parameters: options.parameters,
        personalization: options.personalization,
        extensions: options.extensions,
      },
      {
        client: options.preview
          ? (this.#previewClient as ContentfulViewDeliveryClient)
          : this.#deliveryClient,
      },
      { config: resolverConfig, ...this.#mergeFetchResolveOptions(resolveOptions) }
    );
  }

  fetchByDestinationNode(
    options: FetchByDestinationNodeOptions,
    resolveOptions: FetchResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult> {
    const resolverConfig = requireResolverConfig(resolveOptions);
    return fetchExperience(
      {
        spaceId: this.spaceId,
        destinationId: options.destinationId,
        nodeId: options.nodeId,
        personalization: options.personalization,
      },
      { client: this.#deliveryClient },
      { config: resolverConfig, ...this.#mergeFetchResolveOptions(resolveOptions) }
    );
  }

  fetchByDestinationPath(
    options: FetchByDestinationPathOptions,
    resolveOptions: FetchResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult> {
    const resolverConfig = requireResolverConfig(resolveOptions);
    return fetchExperience(
      {
        spaceId: this.spaceId,
        destinationId: options.destinationId,
        path: options.path,
        personalization: options.personalization,
      },
      { client: this.#deliveryClient },
      { config: resolverConfig, ...this.#mergeFetchResolveOptions(resolveOptions) }
    );
  }

  #mergeResolveOptions(
    options: ResolveOptions
  ): ResolveDefaults & Pick<ResolveOptions, 'sourceMap'> {
    return {
      ...this.#mergeFetchResolveOptions(options),
      sourceMap: options.sourceMap,
    };
  }

  #mergeFetchResolveOptions(options: FetchResolveOptions): ResolveDefaults {
    return {
      metadata: { ...this.#resolveDefaults.metadata, ...options.metadata },
      debug: options.debug ?? this.#resolveDefaults.debug,
    };
  }
}

function requireResolverConfig(options: ResolveOptions | undefined): ResolverConfig {
  if (options?.config === undefined) {
    throw new TypeError('A resolver config is required in resolveOptions.config');
  }
  return options.config;
}

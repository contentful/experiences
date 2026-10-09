import {
  ContentfulViewDeliveryClient,
  fetchExperience,
  PREVIEW_HOST,
  type DestinationRedirectResult,
  type ExperienceRequestExtensions,
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
import {
  createRuntimeDeliveryClient,
  type RuntimeDeliveryClientOptions,
} from './create-runtime-delivery-client.js';
import {
  createRuntimeOptimizationClient,
  type RuntimeOptimizationConfig,
} from './create-optimization-client.js';
import { DEFAULT_EVENT_CONTEXT_LIBRARY } from './sdk-info.js';
import {
  createRuntimeEventMethods,
  type RuntimeEventBindings,
  type RuntimeEventDispatch,
  type RuntimeEventMethods,
  type RuntimeOptimizationApiClient,
} from './runtime-event-methods.js';

export type RuntimeResolveOptions = {
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
export type RuntimeFetchResolveOptions = Omit<RuntimeResolveOptions, 'sourceMap'>;

export type RuntimeEventBuilderConfig = Omit<EventBuilderConfig, 'channel' | 'library'> & {
  channel: EventBuilderConfig['channel'];
  library?: Partial<EventBuilderConfig['library']>;
};

export type RuntimeFetchExperienceOptions = {
  experienceId: string;
  locale?: string;
  personalization?: PersonalizationOptions;
  extensions?: ExperienceRequestExtensions;
  preview?: boolean;
};

export type RuntimeFetchByDestinationNodeOptions = {
  destinationId: string;
  nodeId: string;
};

export type RuntimeFetchByDestinationPathOptions = {
  destinationId: string;
  path: string;
};

/** Structural contract implemented by the shared runtime. */
export interface ExperienceRuntime {
  readonly spaceId: string;
  readonly environmentId: string;
  readonly locale: string | undefined;
  readonly eventBuilder: EventBuilder;
  resolveExperience(
    payload: ExperiencePayload,
    resolveOptions?: RuntimeResolveOptions
  ): Promise<PortableRenderPlan>;
  fetchExperience(
    options: RuntimeFetchExperienceOptions,
    resolveOptions?: RuntimeFetchResolveOptions
  ): Promise<PortableRenderPlan>;
  fetchByDestinationNode(
    options: RuntimeFetchByDestinationNodeOptions,
    resolveOptions?: RuntimeFetchResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult>;
  fetchByDestinationPath(
    options: RuntimeFetchByDestinationPathOptions,
    resolveOptions?: RuntimeFetchResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult>;
}

export type ContentfulExperiencesConfig = {
  spaceId: string;
  environmentId: string;
  locale?: string;
  resolverConfig: ResolverConfig;
  /** Configuration for the runtime-owned Content Delivery API client. */
  delivery: RuntimeDeliveryClientOptions;
  /** Optional configuration for the runtime-owned Content Preview API client. */
  preview?: RuntimeDeliveryClientOptions;
  /** Overrides for the runtime-owned Personalization and Analytics event transport. */
  optimization?: RuntimeOptimizationConfig;
  resolveDefaults?: Pick<RuntimeResolveOptions, 'metadata' | 'debug'>;
  eventBuilder: RuntimeEventBuilderConfig;
};

export class ContentfulExperiences implements ExperienceRuntime {
  readonly spaceId: string;
  readonly environmentId: string;
  readonly eventBuilder: EventBuilder;

  readonly #locale: string | undefined;
  readonly #resolverConfig: ResolverConfig;
  readonly #deliveryClient: ContentfulViewDeliveryClient;
  readonly #previewClient: ContentfulViewDeliveryClient | undefined;
  protected readonly optimizationApi: RuntimeOptimizationApiClient;
  readonly #resolveDefaults: Pick<RuntimeResolveOptions, 'metadata' | 'debug'>;

  constructor(config: ContentfulExperiencesConfig) {
    this.spaceId = config.spaceId;
    this.environmentId = config.environmentId;
    this.#locale = config.locale;
    this.#resolverConfig = config.resolverConfig;
    this.#deliveryClient = createRuntimeDeliveryClient(config.delivery);
    this.#previewClient =
      config.preview === undefined
        ? undefined
        : createRuntimeDeliveryClient(config.preview, PREVIEW_HOST);
    this.optimizationApi = createRuntimeOptimizationClient({
      spaceId: config.spaceId,
      environmentId: config.environmentId,
      ...config.optimization,
    });
    this.#resolveDefaults = config.resolveDefaults ?? {};

    this.eventBuilder = new EventBuilder({
      ...config.eventBuilder,
      library: { ...DEFAULT_EVENT_CONTEXT_LIBRARY, ...config.eventBuilder.library },
      getLocale: config.eventBuilder.getLocale ?? (() => this.locale),
    });
  }

  get locale(): string | undefined {
    return this.#locale;
  }

  protected createEventMethods(
    bindings: RuntimeEventBindings,
    dispatch?: RuntimeEventDispatch
  ): RuntimeEventMethods {
    return createRuntimeEventMethods(this.optimizationApi, this.eventBuilder, bindings, dispatch);
  }

  resolveExperience(
    payload: ExperiencePayload,
    resolveOptions?: RuntimeResolveOptions
  ): Promise<PortableRenderPlan> {
    return resolveCoreExperience(
      payload,
      this.#resolverConfig,
      this.#mergeResolveOptions(resolveOptions)
    );
  }

  fetchExperience(
    options: RuntimeFetchExperienceOptions,
    resolveOptions?: RuntimeFetchResolveOptions
  ): Promise<PortableRenderPlan> {
    if (options.preview === true && this.#previewClient === undefined) {
      throw new Error(
        'fetchExperience() called with preview: true but this runtime has no preview client'
      );
    }
    return fetchExperience(
      {
        spaceId: this.spaceId,
        environmentId: this.environmentId,
        experienceId: options.experienceId,
        locale: options.locale ?? this.locale,
        personalization: options.personalization,
        extensions: options.extensions,
      },
      {
        client: options.preview
          ? (this.#previewClient as ContentfulViewDeliveryClient)
          : this.#deliveryClient,
      },
      { config: this.#resolverConfig, ...this.#mergeResolveOptions(resolveOptions) }
    );
  }

  fetchByDestinationNode(
    options: RuntimeFetchByDestinationNodeOptions,
    resolveOptions?: RuntimeFetchResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult> {
    return fetchExperience(
      { spaceId: this.spaceId, destinationId: options.destinationId, nodeId: options.nodeId },
      { client: this.#deliveryClient },
      { config: this.#resolverConfig, ...this.#mergeResolveOptions(resolveOptions) }
    );
  }

  fetchByDestinationPath(
    options: RuntimeFetchByDestinationPathOptions,
    resolveOptions?: RuntimeFetchResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult> {
    return fetchExperience(
      { spaceId: this.spaceId, destinationId: options.destinationId, path: options.path },
      { client: this.#deliveryClient },
      { config: this.#resolverConfig, ...this.#mergeResolveOptions(resolveOptions) }
    );
  }

  #mergeResolveOptions(options: RuntimeResolveOptions | undefined): RuntimeResolveOptions {
    return {
      metadata: { ...this.#resolveDefaults.metadata, ...options?.metadata },
      debug: options?.debug ?? this.#resolveDefaults.debug,
      sourceMap: options?.sourceMap,
    };
  }
}

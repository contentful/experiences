import type { ContentfulViewDeliveryClient } from '@contentful/experience-delivery';
import { resolveExperience as resolveCoreExperience } from '@contentful/experiences-sdk-core';
import type {
  ExperiencePayload,
  PortableRenderPlan,
  ResolverConfig,
} from '@contentful/experiences-sdk-core';
import EventBuilder from './event-builder.js';
import type { EventBuilderConfig } from './event-builder.js';
import { createClient } from './create-client.js';
import { fetchExperience, type DestinationRedirectResult } from './fetch-experience.js';
import {
  fetchPreviewSessionWithClient,
  type PreviewSessionExperienceOptions,
} from './fetch-preview-session.js';
import type { CreateClientOptions } from './create-client.js';
import { PREVIEW_HOST } from './hosts.js';
import { eventBuilderLibrary } from './sdk-info.js';

export type RuntimeClientSource = CreateClientOptions | { client: ContentfulViewDeliveryClient };

export type RuntimeResolveOptions = {
  metadata?: Record<string, unknown>;
  debug?: boolean;
  initialViewportId?: string;
};

export type RuntimeEventBuilderConfig = Omit<EventBuilderConfig, 'channel' | 'library'> & {
  channel?: EventBuilderConfig['channel'];
  library?: Partial<EventBuilderConfig['library']>;
};

export type RuntimeFetchExperienceOptions = {
  experienceId: string;
  locale?: string;
  preview?: boolean;
  withSourceMap?: boolean;
};

export type RuntimeFetchByDestinationNodeOptions = {
  destinationId: string;
  nodeId: string;
};

export type RuntimeFetchByDestinationPathOptions = {
  destinationId: string;
  path: string;
};

export type RuntimeFetchPreviewSessionOptions = Pick<
  PreviewSessionExperienceOptions,
  'sessionId' | 'resourceResolution'
>;

/** Structural contract implemented by the Client runtime. */
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
  fetchPreviewSession(
    options: RuntimeFetchPreviewSessionOptions,
    resolveOptions?: RuntimeResolveOptions
  ): Promise<PortableRenderPlan>;
}

export type ContentfulExperiencesConfig = {
  spaceId: string;
  environmentId: string;
  locale?: string;
  resolverConfig: ResolverConfig;
  delivery: RuntimeClientSource;
  preview?: RuntimeClientSource;
  resolveDefaults?: Pick<RuntimeResolveOptions, 'metadata' | 'debug'>;
  eventBuilder?: RuntimeEventBuilderConfig;
};

export class ContentfulExperiences implements ExperienceRuntime {
  readonly spaceId: string;
  readonly environmentId: string;
  readonly locale: string | undefined;
  readonly eventBuilder: EventBuilder;

  readonly #resolverConfig: ResolverConfig;
  readonly #deliveryClient: ContentfulViewDeliveryClient;
  readonly #previewClient: ContentfulViewDeliveryClient | undefined;
  readonly #resolveDefaults: Pick<RuntimeResolveOptions, 'metadata' | 'debug'>;

  constructor(config: ContentfulExperiencesConfig) {
    this.spaceId = config.spaceId;
    this.environmentId = config.environmentId;
    this.locale = config.locale;
    this.#resolverConfig = config.resolverConfig;
    this.#deliveryClient = resolveClient(config.delivery);
    this.#previewClient =
      config.preview === undefined ? undefined : resolveClient(config.preview, PREVIEW_HOST);
    this.#resolveDefaults = config.resolveDefaults ?? {};

    const eventBuilder = config.eventBuilder ?? {};
    this.eventBuilder = new EventBuilder({
      ...eventBuilder,
      channel: eventBuilder.channel ?? 'server',
      library: { ...eventBuilderLibrary, ...eventBuilder.library },
      getLocale: eventBuilder.getLocale ?? (() => this.locale),
    });
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
    resolveOptions?: RuntimeResolveOptions
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
        withSourceMap: options.withSourceMap,
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
    resolveOptions?: RuntimeResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult> {
    return fetchExperience(
      { spaceId: this.spaceId, destinationId: options.destinationId, nodeId: options.nodeId },
      { client: this.#deliveryClient },
      { config: this.#resolverConfig, ...this.#mergeResolveOptions(resolveOptions) }
    );
  }

  fetchByDestinationPath(
    options: RuntimeFetchByDestinationPathOptions,
    resolveOptions?: RuntimeResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult> {
    return fetchExperience(
      { spaceId: this.spaceId, destinationId: options.destinationId, path: options.path },
      { client: this.#deliveryClient },
      { config: this.#resolverConfig, ...this.#mergeResolveOptions(resolveOptions) }
    );
  }

  fetchPreviewSession(
    options: RuntimeFetchPreviewSessionOptions,
    resolveOptions?: RuntimeResolveOptions
  ): Promise<PortableRenderPlan> {
    if (this.#previewClient === undefined) {
      throw new Error('fetchPreviewSession() called but this runtime has no preview client');
    }
    return fetchPreviewSessionWithClient(
      { spaceId: this.spaceId, environmentId: this.environmentId, ...options },
      this.#previewClient,
      { config: this.#resolverConfig, ...this.#mergeResolveOptions(resolveOptions) }
    );
  }

  #mergeResolveOptions(options: RuntimeResolveOptions | undefined): RuntimeResolveOptions {
    return {
      metadata: { ...this.#resolveDefaults.metadata, ...options?.metadata },
      debug: options?.debug ?? this.#resolveDefaults.debug,
      initialViewportId: options?.initialViewportId,
    };
  }
}

function resolveClient(
  source: RuntimeClientSource,
  defaultHost?: string
): ContentfulViewDeliveryClient {
  return 'client' in source
    ? source.client
    : createClient({ ...source, host: source.host ?? defaultHost });
}

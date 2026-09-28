import {
  ContentfulExperiences as ClientContentfulExperiences,
  type ContentfulExperiencesConfig,
  type DestinationRedirectResult,
  type EventBuilderConfig,
  type RuntimeFetchByDestinationNodeOptions,
  type RuntimeFetchByDestinationPathOptions,
  type RuntimeFetchExperienceOptions,
  type RuntimeResolveOptions,
} from '@contentful/experiences-client';
import type { ExperiencePayload, PortableRenderPlan } from '@contentful/experiences-sdk-core';

import { DEFAULT_EVENT_CONTEXT_LIBRARY } from './sdk-info.js';

/**
 * Stable event metadata applied by this SDK instance.
 * Request-sensitive event behavior belongs to the future event-method layer,
 * not this long-lived configuration.
 */
export type ExperiencesNodeConfig = Omit<ContentfulExperiencesConfig, 'eventBuilder'> & {
  app?: EventBuilderConfig['app'];
};

/** Context that is scoped to one incoming Node request. */
export type ExperiencesNodeRequestContext = {
  locale?: string;
  resolveOptions?: RuntimeResolveOptions;
};

/**
 * A request-bound facade. This is structural on purpose: callers need only the
 * request-safe operations, rather than the SDK's long-lived client internals.
 */
export interface ExperiencesNodeRequest {
  readonly locale: string | undefined;
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
    return new RequestBoundExperiences(this, context);
  }
}

class RequestBoundExperiences implements ExperiencesNodeRequest {
  readonly locale: string | undefined;

  constructor(
    private readonly runtime: ContentfulExperiences,
    private readonly context: ExperiencesNodeRequestContext
  ) {
    this.locale = context.locale ?? runtime.locale;
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

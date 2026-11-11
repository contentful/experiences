import {
  ExperienceFetchError,
  NotFoundError,
  type ConsentInput,
  type Config,
  type RequestRuntime,
  type FetchExperienceOptions,
  type FetchResolveOptions,
  type RuntimeLivePreviewOptions,
} from '@contentful/experiences-node';
import type { Config } from '@contentful/experiences-react/server';
import type { ExperiencesRootProps } from '@contentful/experiences-react/client';
import type { NextjsBrowserConfig } from './browser-config.js';
import type { NextjsCookieConfig } from './cookies.js';
import type { NextjsCookieReader, NextjsRequestLike } from './request-context.js';
import type { NextjsRequestResult } from './request-result.js';
import { serializeNextjsJsonForHtml, serializeNextjsPlan } from './serialization.js';

export interface NextjsServerRequestContext {
  readonly request: NextjsRequestLike;
  readonly cookies: NextjsCookieReader;
  readonly headers: globalThis.Headers;
  readonly requestUrl: string;
  readonly routeKey: string;
}

export type NextjsServerValue<T> = T | ((context: NextjsServerRequestContext) => T | Promise<T>);

export interface NextjsServerRequestResult extends NextjsRequestResult {
  readonly experienceId: string;
  readonly error?: unknown;
}

export interface NextjsServerRequestPolicy {
  readonly experience: NextjsServerValue<FetchExperienceOptions>;
  readonly resolveOptions?: NextjsServerValue<Omit<FetchResolveOptions, 'config'>>;
  readonly metadataKeys?: readonly string[];
  readonly initialEvents?: NextjsServerValue<
    NonNullable<FetchExperienceOptions['personalization']>['events']
  >;
  readonly pagePayload?: NextjsServerValue<NonNullable<NextjsRequestResult['initialPagePayload']>>;
  /** Application-owned composition on the same facade, before projection and cleanup. */
  readonly composeRequest?: (
    request: RequestRuntime,
    primary: NextjsServerRequestResult,
    context: NextjsServerRequestContext
  ) => void | Promise<void>;
}

export interface NextjsServerExperiencesConfig extends Config {
  readonly config: Config;
  readonly browser?: NextjsBrowserConfig;
  readonly consent?: {
    readonly server?: NextjsServerValue<ConsentInput>;
    readonly clientDefaults?: Pick<
      NonNullable<ExperiencesRootProps['defaults']>,
      'consent' | 'persistenceConsent'
    >;
  };
  readonly cookie?: NextjsCookieConfig;
  readonly livePreview?: (
    context: NextjsServerRequestContext
  ) => RuntimeLivePreviewOptions | undefined | Promise<RuntimeLivePreviewOptions | undefined>;
  readonly request?: NextjsServerRequestPolicy;
}

export type NextjsServerRequestOverrides = Partial<NextjsServerRequestPolicy> & {
  readonly consent?: ConsentInput;
  readonly locale?: string;
  readonly isPreview?: boolean;
};

export async function resolveNextjsServerValue<T>(
  value: NextjsServerValue<T>,
  context: NextjsServerRequestContext
): Promise<T> {
  return typeof value === 'function'
    ? await (value as (context: NextjsServerRequestContext) => T | Promise<T>)(context)
    : value;
}

/** Only expected Delivery failures are content results; preparation and control flow propagate. */
export function isNextjsContentError(error: unknown): boolean {
  return error instanceof ExperienceFetchError || error instanceof NotFoundError;
}

/** The explicit browser config is the only credential source for built-in client roots. */
export function nextjsBrowserRootConfig(
  options: NextjsServerExperiencesConfig
): NextjsBrowserConfig {
  if (!options.browser)
    throw new TypeError('The default request root requires browser configuration.');
  return JSON.parse(serializeNextjsJsonForHtml(options.browser)) as NextjsBrowserConfig;
}

/** Project the whole result for browser adoption, excluding raw errors and private metadata. */
export function serializeNextjsRequestResult(
  result: NextjsServerRequestResult,
  options: { readonly metadataKeys?: readonly string[] } = {}
): NextjsRequestResult {
  return JSON.parse(
    serializeNextjsJsonForHtml({
      requestId: result.requestId,
      routeKey: result.routeKey,
      experience: result.experience,
      ...(result.plan ? { plan: serializeNextjsPlan(result.plan, options) } : {}),
      ...(result.contentError ? { contentError: result.contentError } : {}),
      ...(result.handoff ? { handoff: result.handoff } : {}),
      ...(result.initialPagePayload ? { initialPagePayload: result.initialPagePayload } : {}),
    })
  ) as NextjsRequestResult;
}

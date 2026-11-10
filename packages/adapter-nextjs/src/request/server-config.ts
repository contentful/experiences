import {
  ExperienceFetchError,
  NotFoundError,
  type ConsentInput,
  type Config as NodeConfig,
  type RequestRuntime,
  type FetchExperienceOptions,
  type FetchResolveOptions,
  type LivePreviewOptions as SessionPreviewOptions,
} from '@contentful/experiences-node';
import type { Config as RegistryConfig } from '@contentful/experiences-react/server';
import type { ExperiencesRootProps } from '@contentful/experiences-react/client';
import type { BrowserConfig } from '../presentation/browser-config.js';
import type { CookieConfig } from './cookies.js';
import type { CookieReader, RequestLike } from './context.js';
import type { HydrationMode, RequestResult } from '../presentation/request-result.js';
import type { LivePreviewConfig } from '../presentation/live-preview.js';
import { serializeJsonForHtml, serializePlan } from '../cache/serialization.js';

export type { LivePreviewConfig, LivePreviewOptions } from '../presentation/live-preview.js';

export interface ServerRequestContext {
  readonly request: RequestLike;
  readonly cookies: CookieReader;
  readonly headers: globalThis.Headers;
  readonly requestUrl: string;
  readonly routeKey: string;
}

export type ServerValue<T> = T | ((context: ServerRequestContext) => T | Promise<T>);

export interface ServerRequestResult extends RequestResult {
  readonly experienceId: string;
  readonly hydration: HydrationMode;
  readonly error?: unknown;
}

export interface ServerRequestPolicy {
  readonly experience: ServerValue<FetchExperienceOptions>;
  readonly hydration?: ServerValue<HydrationMode>;
  readonly resolveOptions?: ServerValue<Omit<FetchResolveOptions, 'config'>>;
  readonly metadataKeys?: readonly string[];
  readonly initialEvents?: ServerValue<
    NonNullable<FetchExperienceOptions['personalization']>['events']
  >;
  readonly pagePayload?: ServerValue<NonNullable<RequestResult['initialPagePayload']>>;
  /** Application-owned composition on the same facade, before projection and cleanup. */
  readonly composeRequest?: (
    request: RequestRuntime,
    primary: ServerRequestResult,
    context: ServerRequestContext
  ) => void | Promise<void>;
}

export interface ServerConfig extends NodeConfig {
  readonly config: RegistryConfig;
  readonly browser?: BrowserConfig;
  readonly consent?: {
    readonly server?: ServerValue<ConsentInput>;
    readonly clientDefaults?: Pick<
      NonNullable<ExperiencesRootProps['defaults']>,
      'consent' | 'persistenceConsent'
    >;
  };
  readonly cookie?: CookieConfig;
  readonly livePreview?:
    | LivePreviewConfig
    | ((
        context: ServerRequestContext
      ) => SessionPreviewOptions | undefined | Promise<SessionPreviewOptions | undefined>);
  readonly request?: ServerRequestPolicy;
}

export type ServerRequestOverrides = Partial<ServerRequestPolicy> & {
  readonly consent?: ConsentInput;
  readonly locale?: string;
  readonly isPreview?: boolean;
};

export async function resolveServerValue<T>(
  value: ServerValue<T>,
  context: ServerRequestContext
): Promise<T> {
  return typeof value === 'function'
    ? await (value as (context: ServerRequestContext) => T | Promise<T>)(context)
    : value;
}

/** Only expected Delivery failures are content results; preparation and control flow propagate. */
export function isContentError(error: unknown): boolean {
  return error instanceof ExperienceFetchError || error instanceof NotFoundError;
}

/** The explicit browser config is the only credential source for built-in client roots. */
export function browserRootConfig(options: ServerConfig): BrowserConfig {
  if (!options.browser)
    throw new TypeError('The default request root requires browser configuration.');
  return JSON.parse(serializeJsonForHtml(options.browser)) as BrowserConfig;
}

/** Project the whole result for a browser root, without server-only content or raw errors. */
export function serializeRequestResult(
  result: ServerRequestResult,
  options: { readonly metadataKeys?: readonly string[] } = {}
): RequestResult {
  return JSON.parse(
    serializeJsonForHtml({
      requestId: result.requestId,
      routeKey: result.routeKey,
      experience: result.experience,
      ...(result.hydration === 'preserve-server' && result.plan
        ? { plan: serializePlan(result.plan, options) }
        : {}),
      ...(result.contentError ? { contentError: result.contentError } : {}),
      ...(result.handoff ? { handoff: result.handoff } : {}),
      ...(result.initialPagePayload ? { initialPagePayload: result.initialPagePayload } : {}),
      ...(result.livePreview === undefined ? {} : { livePreview: result.livePreview }),
    })
  ) as RequestResult;
}

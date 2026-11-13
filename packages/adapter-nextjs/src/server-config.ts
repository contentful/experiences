import {
  ExperienceFetchError,
  NotFoundError,
  type ConsentInput,
  type PreviewConfig,
  type Config as NodeConfig,
  type ExperienceRequest,
  type RequestRuntime,
  type FetchExperienceOptions,
  type FetchResolveOptions,
} from '@contentful/experiences-node';
import type { Config } from '@contentful/experiences-react/server';
import type { ExperiencesRootProps } from '@contentful/experiences-react/client';
import type { BrowserConfig } from './browser-config.js';
import type { CookieConfig } from './cookies.js';
import type { CookieReader, RequestLike } from './request-context.js';
import type { RequestResult } from './request-result.js';
import { serializeJsonForHtml, serializePlan } from './serialization.js';

export type { PreviewConfig } from '@contentful/experiences-node';
export type { PreviewContext } from './preview.js';

export interface ServerRequestContext {
  readonly request: RequestLike;
  readonly cookies: CookieReader;
  readonly headers: globalThis.Headers;
  readonly requestUrl: string;
  readonly routeKey: string;
}

export type ServerValue<T> = T | ((context: ServerRequestContext) => T | Promise<T>);

export interface ServerRequestResult extends RequestResult {
  /**
   * The primary Experience id: the requested id, or for a Destination the id it
   * resolved to. Absent for a Destination redirect, failure or speculative request.
   */
  readonly experienceId?: string;
  readonly error?: unknown;
}

export interface ServerRequestPolicy {
  /** SSR commits on the server; hybrid previews there and commits browser replay. */
  readonly mode?: ServerValue<'ssr' | 'hybrid'>;
  /**
   * The one primary per request: `{ experienceId, ... }`, `{ destinationId, path }` or
   * `{ destinationId, nodeId }`. Destination selectors are space-scoped and carry only
   * personalization.
   */
  readonly experience: ServerValue<ExperienceRequest>;
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

export interface ServerConfig extends Omit<NodeConfig, 'preview'> {
  readonly config: Config;
  readonly browser?: BrowserConfig;
  readonly consent?: {
    readonly server?: ServerValue<ConsentInput>;
    readonly clientDefaults?: Pick<
      NonNullable<ExperiencesRootProps['defaults']>,
      'consent' | 'persistenceConsent'
    >;
  };
  readonly cookie?: CookieConfig;
  readonly preview?: PreviewConfig;
  readonly request?: ServerRequestPolicy;
}

export type ServerRequestOverrides = Partial<ServerRequestPolicy> & {
  readonly consent?: ConsentInput;
  readonly locale?: string;
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

/** A missing Experience, Destination, path or node: normal framework 404 handling applies. */
export function isNotFoundError(error: unknown): boolean {
  return error instanceof NotFoundError;
}

/** The explicit browser config is the only credential source for built-in client roots. */
export function browserRootConfig(options: ServerConfig): BrowserConfig {
  if (!options.browser)
    throw new TypeError('The default request root requires browser configuration.');
  return JSON.parse(serializeJsonForHtml(options.browser)) as BrowserConfig;
}

/** Project the whole result for browser adoption, excluding raw errors and private metadata. */
export function serializeRequestResult(
  result: ServerRequestResult,
  options: { readonly metadataKeys?: readonly string[] } = {}
): RequestResult {
  return JSON.parse(
    serializeJsonForHtml({
      requestId: result.requestId,
      routeKey: result.routeKey,
      experience: result.experience,
      ...(result.plan ? { plan: serializePlan(result.plan, options) } : {}),
      ...(result.contentError ? { contentError: result.contentError } : {}),
      ...(result.notFound ? { notFound: true } : {}),
      ...(result.redirect ? { redirect: { path: result.redirect.path } } : {}),
      ...(result.handoff ? { handoff: result.handoff } : {}),
      ...(result.initialPageOwner ? { initialPageOwner: result.initialPageOwner } : {}),
      ...(result.initialPagePayload ? { initialPagePayload: result.initialPagePayload } : {}),
      ...(result.preview === undefined ? {} : { preview: result.preview }),
    })
  ) as RequestResult;
}

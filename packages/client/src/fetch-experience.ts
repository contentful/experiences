import type { ContentfulViewDeliveryClient } from '@contentful/experience-delivery';
import { ContentfulViewDelivery } from '@contentful/experience-delivery';
import { createDebugLogger, resolveExperience } from '@contentful/experiences-sdk-core';
import type { PortableRenderPlan, ResolverConfig } from '@contentful/experiences-sdk-core';
import { createClient } from './create-client.js';
import { DestinationPreviewNotSupportedError, ExperienceFetchError } from './errors.js';
import { PREVIEW_HOST } from './hosts.js';
import {
  readSourceMap,
  toExperiencePayload,
  toExperiencePayloadFromDestination,
  type ExperienceResponse,
} from './to-experience-payload.js';

export type ByIdExperienceOptions = {
  spaceId: string;
  environmentId: string;
  experienceId: string;
  locale?: string;
  /**
   * Fetch the content source map alongside the experience, onto
   * `PortableRenderPlan.sourceMap`. Defaults to `false` because the map is large.
   *
   * Switches the request from `GET` to `POST` (the opt-in is a request-body
   * field, only accepted by `getWithOverrides`), so it is not CDN-cacheable.
   * Query params, auth, and the response shape are unchanged.
   */
  withSourceMap?: boolean;
};

/**
 * Resolve an Experience by the Destination Node instead of `experienceId`
 * The destinations delivery endpoints are space-scoped only and have no locale
 * param, unlike the by-id path.
 */
export type ByDestinationNodeIdExperienceOptions = {
  spaceId: string;
  destinationId: string;
  nodeId: string;
};

/**
 * Resolve an Experience by the absolute path wired up to a
 * Destination Node, instead of a node id directly. Same scoping as
 * `ByDestinationNodeIdExperienceOptions` — no `environmentId` or `locale`.
 */
export type ByDestinationPathExperienceOptions = {
  spaceId: string;
  destinationId: string;
  /** Absolute path to resolve. Must start with `/`. */
  path: string;
};

export type ExperienceOptions =
  ByIdExperienceOptions | ByDestinationNodeIdExperienceOptions | ByDestinationPathExperienceOptions;

/**
 * A Destination resolution that the app must act on as control flow — honor
 * it by navigating or re-resolving at the new path — rather than a hydrated
 * Experience to render. Modeled as a normal return value, not a thrown error,
 * per the Destinations delivery API's own framing of a redirect response.
 */
export interface DestinationRedirectResult {
  redirect: { path: string };
}

export type ClientOptions =
  | {
      accessToken: string;
      /**
       * Preview access token. Required when calling with `preview: true`.
       */
      previewToken?: string;
      /**
       * Flip between delivery (default) and preview at request time. When
       * `true`, `fetchExperience` uses `previewToken` and the preview host;
       * when `false` or unset, it uses `accessToken` and the delivery host.
       * Ignored when a pre-made `client` is passed instead of inline creds.
       */
      preview?: boolean;
      /**
       * Custom base URL for the delivery client (staging, proxy, per-region).
       * Wins over the `preview`-derived default host — combine `host` with
       * `preview: true` to point preview mode at a non-prod endpoint.
       * Omit for the standard delivery / preview hosts.
       */
      host?: string;
    }
  | { client: ContentfulViewDeliveryClient };

export type ResolveOptions = {
  config: ResolverConfig;
  /**
   * Arbitrary per-render metadata exposed to every resolver as
   * `ctx.experience.metadata` and readable at render time via the framework
   * adapter's `useExperience()` / `getExperience()`.
   */
  metadata?: Record<string, unknown>;
  /**
   * Observability switch. When on: logs the fetch (host, ids) and the raw
   * payload here, and threads through to `resolveExperience` (resolution steps
   * + `resolveData` timings) and the renderer (visible missing-component box,
   * debug fallback). A single boolean across fetch + resolve + render.
   */
  debug?: boolean;
  /**
   * Per-request fallback viewport for server-side design pre-resolution. Pass
   * the same id you seed the renderer's `initialViewportId` with (e.g. a
   * User-Agent-derived viewport) so SSR paints correct design on first render.
   */
  initialViewportId?: string;
};

// TS overload signatures, not real redeclarations — base ESLint's no-redeclare doesn't know the
// overload form (@typescript-eslint's own version does), so each repeated signature needs a
// disable comment.
export async function fetchExperience(
  experienceOptions: ByIdExperienceOptions,
  clientOptions: ClientOptions,
  resolveOptions: ResolveOptions
): Promise<PortableRenderPlan>;
// eslint-disable-next-line no-redeclare -- see above
export async function fetchExperience(
  experienceOptions: ByDestinationNodeIdExperienceOptions,
  clientOptions: ClientOptions,
  resolveOptions: ResolveOptions
): Promise<PortableRenderPlan | DestinationRedirectResult>;
// eslint-disable-next-line no-redeclare -- see above
export async function fetchExperience(
  experienceOptions: ByDestinationPathExperienceOptions,
  clientOptions: ClientOptions,
  resolveOptions: ResolveOptions
): Promise<PortableRenderPlan | DestinationRedirectResult>;
// eslint-disable-next-line no-redeclare -- see above
export async function fetchExperience(
  experienceOptions: ExperienceOptions,
  clientOptions: ClientOptions,
  resolveOptions: ResolveOptions
): Promise<PortableRenderPlan | DestinationRedirectResult> {
  const { config, metadata, debug, initialViewportId } = resolveOptions;
  const log = createDebugLogger(debug, 'client');

  if (
    !('client' in clientOptions) &&
    clientOptions.preview &&
    'destinationId' in experienceOptions
  ) {
    const { spaceId, destinationId } = experienceOptions;
    const locator =
      'nodeId' in experienceOptions
        ? { nodeId: experienceOptions.nodeId }
        : { path: experienceOptions.path };
    throw new DestinationPreviewNotSupportedError(
      `fetchExperience() called with preview: true and a destination-shaped experienceOptions ` +
        `(destinationId "${destinationId}"). The Destinations Delivery API does not support ` +
        `preview mode yet — pass preview: false (or omit it) for destination-based fetches.`,
      { spaceId, destinationId, ...locator }
    );
  }

  let client: ContentfulViewDeliveryClient;
  if ('client' in clientOptions) {
    client = clientOptions.client;
    log.log('using caller-supplied delivery client');
  } else {
    const { accessToken, previewToken, preview, host } = clientOptions;
    if (preview && !previewToken) {
      throw new Error(
        'fetchExperience() called with preview: true but no previewToken was provided'
      );
    }
    const resolvedHost = host ?? (preview ? PREVIEW_HOST : undefined);
    client = createClient({
      accessToken: preview ? (previewToken as string) : accessToken,
      host: resolvedHost,
    });
    log.log('created delivery client', { preview: Boolean(preview), host: resolvedHost });
  }

  if ('nodeId' in experienceOptions) {
    const { spaceId, destinationId, nodeId } = experienceOptions;
    return fetchByDestination(
      { spaceId, destinationId, locator: nodeId },
      () => client.destination.resolveByNodeId(spaceId, destinationId, nodeId),
      log,
      { config, metadata, debug, initialViewportId }
    );
  }

  if ('path' in experienceOptions) {
    const { spaceId, destinationId, path } = experienceOptions;
    return fetchByDestination(
      { spaceId, destinationId, locator: path },
      () => client.destination.resolveByPath(spaceId, destinationId, { path }),
      log,
      { config, metadata, debug, initialViewportId }
    );
  }

  const { spaceId, environmentId, experienceId, locale, withSourceMap } = experienceOptions;

  log.log('fetching experience', {
    spaceId,
    environmentId,
    experienceId,
    locale,
    withSourceMap: Boolean(withSourceMap),
  });

  // Typed as the union of both operations' responses — they declare the same
  // union, but which one runs depends on `withSourceMap` below.
  let response: ExperienceResponse;
  try {
    // Both methods hit the same endpoint; only the POST accepts a body, and
    // `extensions` (the source-map opt-in) lives there. Otherwise identical.
    // The alpha-feature header is sent by the delivery client itself since
    // 1.0.0-dev.7, so a caller-supplied `{ client }` is covered too.
    response = withSourceMap
      ? await client.experience.getWithOverrides(spaceId, environmentId, experienceId, {
          locale,
          extensions: { sourceMap: {} },
        })
      : await client.experience.get(spaceId, environmentId, experienceId, { locale });
  } catch (err) {
    // `NotFoundError` is a distinguishable, expected outcome (draft/unpublished/
    // wrong id) — callers already route it to their framework's 404 idiom, so
    // it passes through as-is. Everything else (network failure, bad/expired
    // token, a 5xx) is unexpected and gets wrapped in an actionable error
    // instead of leaking whatever shape the delivery client happened to throw.
    if (err instanceof ContentfulViewDelivery.NotFoundError) {
      throw err;
    }
    const reason = err instanceof Error ? err.message : String(err);
    throw new ExperienceFetchError(
      `Failed to fetch Experience "${experienceId}" (space "${spaceId}", environment ` +
        `"${environmentId}"): ${reason}. Check network connectivity, the access token, and ` +
        `that the space/environment/experience ids are correct.`,
      { spaceId, environmentId, experienceId, cause: err }
    );
  }

  const payload = toExperiencePayload(response);
  const sourceMap = withSourceMap ? readSourceMap(response) : undefined;

  log.lazy('received raw payload', () => payload);
  if (withSourceMap && !sourceMap) log.log('source map requested but not returned');

  return resolveExperience(payload, config, {
    metadata,
    debug,
    initialViewportId,
    sourceMap,
  });
}

/**
 * Shared response-handling for both destination-shaped `fetchExperience`
 * branches (by node id, by path).
 */
async function fetchByDestination(
  identity: { spaceId: string; destinationId: string; locator: string },
  resolve: () => Promise<ContentfulViewDelivery.DestinationExperienceResolutionResponse>,
  log: ReturnType<typeof createDebugLogger>,
  resolveOptions: {
    config: ResolverConfig;
    metadata: Record<string, unknown> | undefined;
    debug: boolean | undefined;
    initialViewportId: string | undefined;
  }
): Promise<PortableRenderPlan | DestinationRedirectResult> {
  const { spaceId, destinationId, locator } = identity;
  const { config, metadata, debug, initialViewportId } = resolveOptions;

  log.log('resolving destination experience', { spaceId, destinationId, locator });

  let response: ContentfulViewDelivery.DestinationExperienceResolutionResponse;
  try {
    response = await resolve();
  } catch (err) {
    if (err instanceof ContentfulViewDelivery.NotFoundError) {
      throw err;
    }
    const reason = err instanceof Error ? err.message : String(err);
    throw new ExperienceFetchError(
      `Failed to resolve Destination "${destinationId}" at "${locator}" (space "${spaceId}"): ` +
        `${reason}. Check network connectivity, the access token, and that the space/` +
        `destination/node-or-path values are correct.`,
      { spaceId, experienceId: locator, cause: err }
    );
  }

  if ('redirect' in response) {
    log.log('destination resolved to a redirect', response.redirect);
    return { redirect: response.redirect };
  }

  const [firstExperience] = response.experiences;
  if (!firstExperience) {
    throw new ExperienceFetchError(
      `Destination "${destinationId}" resolved "${locator}" to zero Experiences ` +
        `(space "${spaceId}"). Expected exactly one hydrated Experience or a redirect.`,
      { spaceId, experienceId: locator }
    );
  }

  const payload = toExperiencePayloadFromDestination(firstExperience.experience);
  log.lazy('received raw payload', () => payload);

  return resolveExperience(payload, config, {
    metadata,
    debug,
    initialViewportId,
  });
}

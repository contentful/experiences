import type { ContentfulViewDeliveryClient } from '@contentful/experience-delivery';
import { ContentfulViewDelivery } from '@contentful/experience-delivery';
import { createDebugLogger, resolveExperience } from '@contentful/experiences-sdk-core';
import type { PortableRenderPlan, ResolverConfig } from '@contentful/experiences-sdk-core';
import { createClient } from './create-client.js';
import { ExperienceFetchError } from './errors.js';
import { PREVIEW_HOST } from './hosts.js';
import {
  readSourceMap,
  toExperiencePayload,
  type ExperienceResponse,
} from './to-experience-payload.js';

export type ExperienceOptions = {
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

export async function fetchExperience(
  experienceOptions: ExperienceOptions,
  clientOptions: ClientOptions,
  resolveOptions: ResolveOptions
): Promise<PortableRenderPlan> {
  const { spaceId, environmentId, experienceId, locale, withSourceMap } = experienceOptions;
  const { config, metadata, debug, initialViewportId } = resolveOptions;
  const log = createDebugLogger(debug, 'client');

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

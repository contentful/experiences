import { ContentfulViewDelivery } from '@contentful/experience-delivery';
import { createDebugLogger } from '@contentful/experiences-sdk-core';
import { assertDestinationPreviewSupported } from './destination-guards.js';
import { resolveDeliveryClient, type ClientOptions } from './client-resolution.js';
import { ExperienceFetchError } from './errors.js';

export type FetchDestinationSitemapOptions = {
  spaceId: string;
  destinationId: string;
};

export type FetchDestinationSitemapPaginationOptions = {
  /** Maximum number of paths to return. Defaults to `100`, maximum `1000`. */
  limit?: number;
  /** Cursor from a previous call's `pages.next`. Treat as opaque; don't combine with `pagePrev`. */
  pageNext?: string;
  /** Cursor from a previous call's `pages.prev`. Treat as opaque; don't combine with `pageNext`. */
  pagePrev?: string;
};

export type SitemapPathItem = {
  /** Path this entry routes. */
  path: string;
  /** Flat id extracted from the entry's `experienceUrn`. */
  experienceId: string;
  /** Type of the Destination Node that claims this path, e.g. `"DestinationExperienceNode"`. */
  type: string;
};

export type DestinationSitemapResult = {
  items: SitemapPathItem[];
  limit: number;
  pages: { next?: string; prev?: string };
};

/**
 * List every routable path in a published Destination. Bulk enumeration —
 * pairs with `fetchExperience`'s `destinationId` + `nodeId`/`path` branches,
 * which resolve one path at a time. Does not hydrate any Experience itself
 * and does not call `fetchExperience` internally.
 */
export async function fetchDestinationSitemap(
  destinationOptions: FetchDestinationSitemapOptions,
  clientOptions: ClientOptions,
  paginationOptions: FetchDestinationSitemapPaginationOptions = {}
): Promise<DestinationSitemapResult> {
  const { spaceId, destinationId } = destinationOptions;
  const log = createDebugLogger(false, 'client');

  if (!('client' in clientOptions)) {
    assertDestinationPreviewSupported(clientOptions.preview, { spaceId, destinationId });
  }

  const client = resolveDeliveryClient(clientOptions, log, 'fetchDestinationSitemap');

  const { limit, pageNext, pagePrev } = paginationOptions;

  let response: ContentfulViewDelivery.DestinationSitemap;
  try {
    response = await client.destination.sitemap(spaceId, destinationId, {
      limit,
      pageNext,
      pagePrev,
    });
  } catch (err) {
    if (err instanceof ContentfulViewDelivery.NotFoundError) {
      throw err;
    }
    const reason = err instanceof Error ? err.message : String(err);
    throw new ExperienceFetchError(
      `Failed to fetch sitemap for Destination "${destinationId}" (space "${spaceId}"): ` +
        `${reason}. Check network connectivity, the access token, and that the space/` +
        `destination ids are correct.`,
      { spaceId, experienceId: destinationId, cause: err }
    );
  }

  const result = {
    items: response.paths.items.map((item) => ({
      path: item.path,
      experienceId: extractIdFromUrn(item.experienceUrn),
      type: item.sys.type,
    })),
    limit: response.paths.limit,
    pages: response.paths.pages,
  };

  log.lazy('received sitemap page', () => result);

  return result;
}

/**
 * Extract the flat id from an `experienceUrn`. Real shape:
 *   crn:contentful:::experience:spaces/$self/environments/$self/experiences/<id>
 *
 * Same one-line logic as the private `extractIdFromUrn` in
 * `packages/core/src/resolve-experience.ts` — not shared across the
 * `core`/`client` package boundary (core stays zero-dep) for one line.
 */
function extractIdFromUrn(urn: string): string {
  const segments = urn.split('/').filter((s) => s.length > 0);
  return segments[segments.length - 1] ?? urn;
}

import {
  ContentfulViewDelivery,
  ContentfulViewDeliveryClient,
} from '@contentful/experience-delivery';
import {
  createDebugLogger,
  isExperiencePayload,
  resolveExperience,
} from '@contentful/experiences-sdk-core';
import type { PortableRenderPlan, ResolverConfig } from '@contentful/experiences-sdk-core';
import { createClient } from './create-client.js';
import { PreviewSessionFetchError } from './errors.js';
import { PREVIEW_HOST } from './hosts.js';
import { previewSessionGetExperienceUrl } from './preview-session-url.js';

export type PreviewSessionExperienceOptions = {
  spaceId: string;
  environmentId: string;
  sessionId: string;
  resourceResolution?: string;
};

export type PreviewSessionClientOptions = { previewToken: string; host?: string };

export type PreviewSessionResolveOptions = {
  config: ResolverConfig;
  metadata?: Record<string, unknown>;
  debug?: boolean;
  initialViewportId?: string;
};

export async function fetchPreviewSession(
  previewSessionOptions: PreviewSessionExperienceOptions,
  clientOptions: PreviewSessionClientOptions,
  resolveOptions: PreviewSessionResolveOptions
): Promise<PortableRenderPlan> {
  const client = createClient({
    accessToken: clientOptions.previewToken,
    host: clientOptions.host ?? PREVIEW_HOST,
  });
  return fetchPreviewSessionWithClient(previewSessionOptions, client, resolveOptions);
}

/** Internal transport seam used by the retained-client runtime. */
export async function fetchPreviewSessionWithClient(
  previewSessionOptions: PreviewSessionExperienceOptions,
  client: ContentfulViewDeliveryClient,
  resolveOptions: PreviewSessionResolveOptions
): Promise<PortableRenderPlan> {
  const { spaceId, environmentId, sessionId } = previewSessionOptions;
  const { config, metadata, debug, initialViewportId } = resolveOptions;
  const log = createDebugLogger(debug, 'live-preview');

  log.log('fetching preview session experience', { spaceId, environmentId, sessionId });
  let payload: unknown;
  try {
    const response = await client.fetch(previewSessionGetExperienceUrl(previewSessionOptions));
    if (response.status === 404) throw new ContentfulViewDelivery.NotFoundError();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    payload = await response.json();
    if (!isExperiencePayload(payload))
      throw new Error('Response was not a valid Experience payload');
    log.lazy('received raw payload', () => payload);
  } catch (error) {
    if (error instanceof ContentfulViewDelivery.NotFoundError) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    throw new PreviewSessionFetchError(
      `Failed to fetch Preview Session "${sessionId}" (space "${spaceId}", environment "${environmentId}"): ${reason}`,
      { spaceId, environmentId, sessionId, cause: error }
    );
  }

  return resolveExperience(payload, config, { metadata, debug, initialViewportId });
}

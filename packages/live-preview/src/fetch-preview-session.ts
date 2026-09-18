import { createClient, NotFoundError, PREVIEW_HOST } from '@contentful/experiences-client';
import {
  createDebugLogger,
  resolveExperience,
  type ExperiencePayload,
  type PortableRenderPlan,
  type ResolverConfig,
} from '@contentful/experiences-sdk-core';
import { PreviewSessionFetchError } from './errors.js';
import { isExperiencePayload } from './experience-payload.js';
import { previewSessionPath } from './preview-session-url.js';

export type PreviewSessionExperienceOptions = {
  spaceId: string;
  environmentId: string;
  sessionId: string;
};

export type PreviewSessionClientOptions = {
  previewToken: string;
  host?: string;
};

export type PreviewSessionResolveOptions = {
  config: ResolverConfig;
  metadata?: Record<string, unknown>;
  debug?: boolean;
  initialViewportId?: string;
};

/**
 * Fetches the current hydrated Experience for a Preview Session and resolves
 * it into the renderer's PortableRenderPlan.
 */
export async function fetchPreviewSession(
  previewSessionOptions: PreviewSessionExperienceOptions,
  clientOptions: PreviewSessionClientOptions,
  resolveOptions: PreviewSessionResolveOptions
): Promise<PortableRenderPlan> {
  const { spaceId, environmentId, sessionId } = previewSessionOptions;
  const { previewToken, host } = clientOptions;
  const { config, metadata, debug, initialViewportId } = resolveOptions;
  const log = createDebugLogger(debug, 'live-preview');
  const client = createClient({
    accessToken: previewToken,
    host: host ?? PREVIEW_HOST,
  });

  log.log('fetching preview session experience', { spaceId, environmentId, sessionId });

  let payload: ExperiencePayload;
  try {
    const response = await client.fetch(`/${previewSessionPath(previewSessionOptions)}/experience`);
    if (response.status === 404) {
      throw new NotFoundError();
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const responsePayload: unknown = await response.json();
    if (!isExperiencePayload(responsePayload)) {
      throw new Error('Response was not a valid Experience payload');
    }
    payload = responsePayload;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new PreviewSessionFetchError(
      `Failed to fetch Preview Session "${sessionId}" (space "${spaceId}", environment ` +
        `"${environmentId}"): ${reason}`,
      { spaceId, environmentId, sessionId, cause: error }
    );
  }

  log.lazy('received raw payload', () => payload);

  return resolveExperience(payload, config, {
    metadata,
    debug,
    initialViewportId,
  });
}

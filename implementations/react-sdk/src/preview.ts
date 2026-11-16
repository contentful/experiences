import { createLivePreviewClient } from '@contentful/experiences-live-preview';
import type { PublicEnvironment } from '../public-config';

// Build-time exclusion matches the Web reference: disabled production builds
// tree-shake the optional package’s factory.
declare const __LIVE_PREVIEW_ENABLED__: boolean;

export function createPreviewConfiguration(environment: PublicEnvironment) {
  const preview = environment.LIVE_PREVIEW;
  if (!preview) return undefined;
  return {
    accessToken: preview.accessToken,
    host: preview.host,
    sessionHost: preview.sessionHost,
    resourceResolution: preview.resourceResolution,
    createClient: __LIVE_PREVIEW_ENABLED__ ? createLivePreviewClient : undefined,
  };
}

import { createLivePreviewClient } from '@contentful/experiences-live-preview';
import type { PublicEnvironment } from '../public-config';

// Build-time exclusion matches the Web reference: disabled production builds
// tree-shake the optional package’s factory.
declare const __LIVE_PREVIEW_ENABLED__: boolean;

export function getPreviewBinding(environment: PublicEnvironment, href: string) {
  const preview = environment.LIVE_PREVIEW;
  if (!preview) return undefined;
  const url = new URL(href);
  const sessionId = url.searchParams.get('preview_session_id')?.trim();
  if (!sessionId) return undefined;
  return {
    experienceId: url.searchParams.get('preview_experience_id')?.trim() || preview.experienceId,
    sessionId,
    sessionHost: preview.sessionHost,
    resourceResolution: preview.resourceResolution,
  };
}

export function createPreviewConfiguration(binding: ReturnType<typeof getPreviewBinding>) {
  if (!binding) return undefined;
  return {
    sessionId: binding.sessionId,
    sessionHost: binding.sessionHost,
    resourceResolution: binding.resourceResolution,
    createClient: __LIVE_PREVIEW_ENABLED__ ? createLivePreviewClient : undefined,
  };
}

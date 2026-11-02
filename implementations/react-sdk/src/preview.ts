import type { PublicEnvironment } from '../public-config';

// Build-time exclusion matches the Web reference: disabled production builds
// never include the optional package or its dynamic import chunk.
declare const __LIVE_PREVIEW_ENABLED__: boolean;

export function getPreviewBinding(environment: PublicEnvironment, href: string) {
  const preview = environment.LIVE_PREVIEW;
  if (!preview) return undefined;
  const url = new URL(href);
  const sessionId = url.searchParams.has('preview_session_id')
    ? url.searchParams.get('preview_session_id')?.trim()
    : preview.sessionId;
  if (!sessionId) return undefined;
  return {
    experienceId: url.searchParams.get('preview_experience_id')?.trim() || preview.experienceId,
    sessionId,
    sessionHost: preview.sessionHost,
    resourceResolution: preview.resourceResolution,
  };
}

export function createPreviewInitializer(binding: ReturnType<typeof getPreviewBinding>) {
  if (!binding) return undefined;
  return async () => {
    if (!__LIVE_PREVIEW_ENABLED__)
      throw new Error(
        'Preview assets are excluded. Enable LIVE_PREVIEW_ENABLED in .env and rebuild.'
      );
    return {
      ...binding,
      implementation: await import('@contentful/experiences-live-preview'),
    };
  };
}

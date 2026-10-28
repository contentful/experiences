/* global URL */
// Consumer integration: the native app imports /dist/preview.js. Vite resolves
// this optional package from installed artifacts into a separately served chunk.
declare const __LIVE_PREVIEW_ENABLED__: boolean;

interface PreviewEnvironment {
  LIVE_PREVIEW?: {
    accessToken: string;
    host?: string;
    experienceId: string;
    sessionId?: string;
    sessionHost?: string;
    resourceResolution?: string;
  };
}

export function getPreviewBinding(environment: PreviewEnvironment, href: string) {
  const preview = environment.LIVE_PREVIEW;
  if (!preview) return undefined;
  const url = new URL(href);
  const sessionId = url.searchParams.has('preview_session_id')
    ? url.searchParams.get('preview_session_id')?.trim()
    : preview.sessionId;
  if (!sessionId) return undefined;
  const experienceId =
    url.searchParams.get('preview_experience_id')?.trim() || preview.experienceId;
  return {
    experienceId,
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

interface PreviewEnvironment {
  LIVE_PREVIEW?: {
    accessToken: string;
    host?: string;
    experienceId: string;
    sessionHost?: string;
    resourceResolution?: string;
  };
}

export function getPreviewBinding(environment: PreviewEnvironment, href: string) {
  const preview = environment.LIVE_PREVIEW;
  if (!preview) return undefined;
  const url = new URL(href);
  const sessionId = url.searchParams.get('preview_session_id')?.trim();
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

export function createPreviewInitializer<T>(
  binding: ReturnType<typeof getPreviewBinding>,
  loadImplementation: (() => T) | undefined
) {
  if (!binding) return undefined;
  return {
    ...binding,
    loadImplementation: () => {
      if (!loadImplementation)
        throw new Error(
          'Preview assets are excluded. Enable LIVE_PREVIEW_ENABLED in .env and rebuild.'
        );
      return loadImplementation();
    },
  };
}

import type { PreviewSessionOptions } from './live-preview.js';

export type PreviewSessionBinding = PreviewSessionOptions & { experienceId: string };

/** Read and trim the first standard session parameter; a blank value disables it. */
export function resolvePreviewSessionId(searchParams?: URLSearchParams): string | undefined {
  return searchParams?.get('preview_session_id')?.trim() || undefined;
}

/** Derive a Preview Session binding from explicit request query parameters. */
export function getPreviewSessionBinding(
  defaults: Omit<PreviewSessionBinding, 'sessionId'>,
  searchParams: URLSearchParams
): PreviewSessionBinding | undefined {
  const sessionId = resolvePreviewSessionId(searchParams);
  if (!sessionId) return undefined;
  return {
    experienceId: searchParams.get('preview_experience_id')?.trim() || defaults.experienceId,
    sessionId,
    ...(defaults.sessionHost !== undefined ? { sessionHost: defaults.sessionHost } : {}),
    ...(defaults.resourceResolution !== undefined
      ? { resourceResolution: defaults.resourceResolution }
      : {}),
  };
}

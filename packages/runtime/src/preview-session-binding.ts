import type { RuntimePreviewSessionOptions } from './live-preview.js';

export type PreviewSessionBinding = RuntimePreviewSessionOptions & { experienceId: string };

/** An explicit value overrides the standard query parameter; a blank value disables it. */
export function resolvePreviewSessionId(
  configured: string | undefined,
  searchParams: URLSearchParams
): string | undefined {
  return (
    (configured === undefined ? searchParams.get('preview_session_id') : configured)?.trim() ||
    undefined
  );
}

/** Derive a Preview Session binding from explicit request query parameters. */
export function getPreviewSessionBinding(
  defaults: Omit<PreviewSessionBinding, 'sessionId'>,
  searchParams: URLSearchParams
): PreviewSessionBinding | undefined {
  const sessionId = resolvePreviewSessionId(undefined, searchParams);
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

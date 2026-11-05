import type { RuntimeLivePreviewOptions } from './live-preview.js';

export type PreviewSessionBinding = Pick<
  RuntimeLivePreviewOptions,
  'experienceId' | 'sessionId' | 'sessionHost' | 'resourceResolution'
>;

/** Derive a Preview Session binding from explicit request query parameters. */
export function getPreviewSessionBinding(
  defaults: Omit<PreviewSessionBinding, 'sessionId'>,
  searchParams: URLSearchParams
): PreviewSessionBinding | undefined {
  const sessionId = searchParams.get('preview_session_id')?.trim();
  if (!sessionId) return undefined;
  return {
    experienceId: searchParams.get('preview_experience_id')?.trim() || defaults.experienceId,
    sessionId,
    sessionHost: defaults.sessionHost,
    resourceResolution: defaults.resourceResolution,
  };
}

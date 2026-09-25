export type PreviewSessionRouteOptions = {
  spaceId: string;
  environmentId: string;
  sessionId: string;
};

function previewSessionPath(options: PreviewSessionRouteOptions): string {
  return [
    'spaces',
    encodeURIComponent(options.spaceId),
    'environments',
    encodeURIComponent(options.environmentId),
    'preview_sessions',
    encodeURIComponent(options.sessionId),
  ].join('/');
}

export function previewSessionGetExperienceUrl({
  resourceResolution,
  ...options
}: PreviewSessionRouteOptions & { resourceResolution?: string }): string {
  const path = `/${previewSessionPath(options)}/experience`;
  if (resourceResolution === undefined) return path;

  const searchParams = new globalThis.URLSearchParams({ resource_resolution: resourceResolution });
  return `${path}?${searchParams.toString()}`;
}

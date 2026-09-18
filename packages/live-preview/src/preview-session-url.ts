import { PREVIEW_WEBSOCKET_HOST } from '@contentful/experiences-client';

type PreviewSessionRouteOptions = {
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

  const searchParams = new globalThis.URLSearchParams({
    resource_resolution: resourceResolution,
  });
  return `${path}?${searchParams.toString()}`;
}

export function previewSessionSubscribeUrl({
  spaceId,
  environmentId,
  sessionId,
  sessionHost,
  previewToken,
  resourceResolution,
}: PreviewSessionRouteOptions & {
  sessionHost?: string;
  previewToken: string;
  resourceResolution?: string;
}): string {
  const url = new globalThis.URL(sessionHost ?? PREVIEW_WEBSOCKET_HOST);
  const basePath = url.pathname.replace(/\/+$/, '');
  url.pathname = `${basePath}/${previewSessionPath({ spaceId, environmentId, sessionId })}/subscribe`;
  url.searchParams.set('access_token', previewToken);
  if (resourceResolution !== undefined) {
    url.searchParams.set('resource_resolution', resourceResolution);
  }

  return url.toString();
}

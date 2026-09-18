import { PREVIEW_WEBSOCKET_HOST } from '@contentful/experiences-client';

type PreviewSessionRouteOptions = {
  spaceId: string;
  environmentId: string;
  sessionId: string;
};

export function previewSessionPath(options: PreviewSessionRouteOptions): string {
  return [
    'spaces',
    encodeURIComponent(options.spaceId),
    'environments',
    encodeURIComponent(options.environmentId),
    'preview_sessions',
    encodeURIComponent(options.sessionId),
  ].join('/');
}

export function previewSessionSubscribeUrl({
  spaceId,
  environmentId,
  sessionId,
  sessionHost,
  previewToken,
}: PreviewSessionRouteOptions & {
  sessionHost?: string;
  previewToken: string;
}): string {
  const url = new globalThis.URL(sessionHost ?? PREVIEW_WEBSOCKET_HOST);
  const basePath = url.pathname.replace(/\/+$/, '');
  url.pathname = `${basePath}/${previewSessionPath({ spaceId, environmentId, sessionId })}/subscribe`;
  url.searchParams.set('access_token', previewToken);

  return url.toString();
}

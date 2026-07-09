import { ContentfulViewDeliveryClient } from '@contentful/experience-delivery';

const XDN_BASE_URL = 'https://xdn.contentful.com';
const XPA_BASE_URL = 'https://preview.xdn.contentful.com';

export interface ExperienceClientOptions {
  spaceId: string;
  environmentId: string;
  accessToken: string;
  preview?: boolean;
}

export interface ExperienceClient {
  readonly spaceId: string;
  readonly environmentId: string;
  readonly accessToken: string;
  readonly preview: boolean;
  readonly _inner: ContentfulViewDeliveryClient;
}

export function createExperienceClient(options: ExperienceClientOptions): ExperienceClient {
  const { spaceId, environmentId, accessToken, preview = false } = options;

  if (!spaceId) throw new Error('createExperienceClient: spaceId is required');
  if (!environmentId) throw new Error('createExperienceClient: environmentId is required');
  if (!accessToken) throw new Error('createExperienceClient: accessToken is required');

  const inner = new ContentfulViewDeliveryClient({
    token: accessToken,
    baseUrl: preview ? XPA_BASE_URL : XDN_BASE_URL,
  });

  return { spaceId, environmentId, accessToken, preview, _inner: inner };
}

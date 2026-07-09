import { ContentfulViewDeliveryClient } from '@contentful/experience-delivery';

const XDN_BASE_URL = 'https://xdn.contentful.com';
const XPA_BASE_URL = 'https://preview.xdn.contentful.com';

export interface ExperienceClientOptions {
  spaceId: string;
  environmentId: string;
  accessToken: string;
  preview?: boolean;
}

export class ExperienceClient extends ContentfulViewDeliveryClient {
  readonly spaceId: string;
  readonly environmentId: string;
  readonly preview: boolean;

  constructor({ spaceId, environmentId, accessToken, preview = false }: ExperienceClientOptions) {
    if (!spaceId) throw new Error('createExperienceClient: spaceId is required');
    if (!environmentId) throw new Error('createExperienceClient: environmentId is required');
    if (!accessToken) throw new Error('createExperienceClient: accessToken is required');

    super({ token: accessToken, baseUrl: preview ? XPA_BASE_URL : XDN_BASE_URL });

    this.spaceId = spaceId;
    this.environmentId = environmentId;
    this.preview = preview;
  }
}

export function createExperienceClient(options: ExperienceClientOptions): ExperienceClient {
  return new ExperienceClient(options);
}

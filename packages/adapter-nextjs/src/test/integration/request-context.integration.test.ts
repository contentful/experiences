import { expect, it } from 'vitest';
import { ContentfulExperiences } from '@contentful/experiences-node';
import { bindNextjsExperiencesRequest } from '../../request/server-request.js';

it('preserves the request origin, referrer and repeated query values in the Node page builder', () => {
  const sdk = new ContentfulExperiences({
    spaceId: 'space',
    environmentId: 'master',
    delivery: { accessToken: 'test' },
  });
  const request = bindNextjsExperiencesRequest(sdk, {
    consent: { events: false, persistence: true },
    request: {
      url: 'https://example.com/page?utm_source=email&tag=a&tag=b',
      headers: new globalThis.Headers({ referer: 'https://referrer.test' }),
    },
    page: { path: '/page', searchParams: { utm_source: 'email', tag: ['a', 'b'] } },
  });
  try {
    expect(request.eventBuilder.buildPageView().context).toMatchObject({
      page: {
        url: 'https://example.com/page?utm_source=email&tag=a&tag=b',
        referrer: 'https://referrer.test',
        query: { utm_source: 'email', tag: ['a', 'b'] },
      },
      campaign: { source: 'email' },
    });
  } finally {
    request.destroy();
    sdk.destroy();
  }
});

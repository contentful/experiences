import { ContentfulViewDelivery } from '@contentful/experience-delivery';
import { describe, expect, it } from 'vitest';
import { ExperienceFetchError, isNotFoundError } from './errors.js';

describe('isNotFoundError', () => {
  it('recognizes the generated Delivery not-found error', () => {
    expect(isNotFoundError(new ContentfulViewDelivery.NotFoundError('missing'))).toBe(true);
  });

  it('recognizes a numeric statusCode without relying on class identity', () => {
    expect(isNotFoundError({ statusCode: 404 })).toBe(true);
    expect(isNotFoundError(Object.assign(new Error('missing'), { statusCode: 404 }))).toBe(true);
  });

  it.each([
    undefined,
    null,
    404,
    '404',
    {},
    { statusCode: '404' },
    { statusCode: 403 },
    { statusCode: 500 },
    { status: 404 },
    { name: 'NotFoundError' },
    new Error('404 Not Found'),
    new Error('failed', { cause: { statusCode: 404 } }),
    new ExperienceFetchError('404 Not Found', {
      spaceId: 'space',
      experienceId: 'experience',
      cause: new ContentfulViewDelivery.NotFoundError('missing'),
    }),
  ])('does not infer not-found from unrelated values or nested errors: %j', (error) => {
    expect(isNotFoundError(error)).toBe(false);
  });
});

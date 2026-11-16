// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import { ContentfulExperiences } from './contentful-experiences.js';

const live = new Set<ContentfulExperiences>();

function create(overrides: Record<string, unknown> = {}): ContentfulExperiences {
  const sdk = new ContentfulExperiences({
    spaceId: 'space',
    environmentId: 'environment',
    delivery: { accessToken: 'delivery-token' },
    ...overrides,
  });
  live.add(sdk);
  return sdk;
}

afterEach(() => {
  for (const sdk of live) sdk.destroy();
  live.clear();
});

describe('Web singleton', () => {
  it('rejects a second live instance and allows a replacement after destroy()', () => {
    const first = create();

    expect(() => create()).toThrow(/already initialized/);

    first.destroy();
    expect(() => create()).not.toThrow();
  });

  it('does not keep the lock when construction fails', () => {
    // No access token and no proxy host: the runtime base class rejects this.
    expect(() => create({ delivery: {} })).toThrow(/accessToken/);

    // The failed attempt must not have locked out a correct one.
    expect(() => create()).not.toThrow();
  });

  it('does not let a failed second attempt release the first instance lock', () => {
    create();

    expect(() => create({ delivery: {} })).toThrow();

    // The first instance is still live, so a third attempt is still refused.
    expect(() => create()).toThrow(/already initialized/);
  });
});

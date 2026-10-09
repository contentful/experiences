import { afterEach, describe, expect, it } from 'vitest';
import { ContentfulExperiences } from './contentful-experiences.js';

const liveRuntimes: ContentfulExperiences[] = [];

function createRuntime() {
  const runtime = new ContentfulExperiences({
    spaceId: 'space',
    environmentId: 'master',
    resolverConfig: { components: {} },
    delivery: { accessToken: 'delivery-token' },
    eventBuilder: { channel: 'server' },
  });
  liveRuntimes.push(runtime);
  return runtime;
}

afterEach(() => {
  for (const runtime of liveRuntimes.splice(0)) runtime.destroy();
});

describe('Experiences runtime singleton', () => {
  it('rejects another live SDK and permits replacement after destroy', () => {
    const first = createRuntime();
    expect(() => createRuntime()).toThrow('Only one SDK instance is supported per runtime');

    first.destroy();
    const replacement = createRuntime();
    first.destroy();
    expect(() => createRuntime()).toThrow('Only one SDK instance is supported per runtime');
    replacement.destroy();
  });

  it('releases ownership when construction fails', () => {
    expect(
      () =>
        new ContentfulExperiences({
          spaceId: 'space',
          environmentId: 'master',
          resolverConfig: { components: {} },
          delivery: {} as never,
          eventBuilder: { channel: 'server' },
        })
    ).toThrow('requires accessToken unless an explicit proxy host is provided');

    expect(createRuntime()).toBeInstanceOf(ContentfulExperiences);
  });
});

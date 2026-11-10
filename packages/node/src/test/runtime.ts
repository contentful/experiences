import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
import type {
  BuiltFetchExperienceOptions,
  FetchResolveOptions,
} from '@contentful/experiences-runtime';
import { payloadFixture, payloadScope } from './fixtures/payload.js';
import { afterEach, vi } from 'vitest';
import { ContentfulExperiences, type Config } from '../contentful-experiences.js';
import type { RequestContext } from '../request/types.js';
import { profileFixture } from './fixtures/profile.js';

const runtimes = new Set<ContentfulExperiences>();
export function trackRuntime<T extends ContentfulExperiences>(runtime: T): T {
  runtimes.add(runtime);
  return runtime;
}
export function createRuntime(overrides: Partial<Config> = {}) {
  return trackRuntime(
    new ContentfulExperiences({
      spaceId: 'space',
      environmentId: 'env',
      delivery: { accessToken: 'token' },
      ...overrides,
    })
  );
}
export function spyOnEventApi(sdk: ContentfulExperiences, responseProfileId: string) {
  const upsert = vi
    .spyOn(sdk.api.personalization, 'upsertProfile')
    .mockResolvedValue({ profile: profileFixture(responseProfileId) } as never);
  const analytics = vi.spyOn(sdk.api.analytics, 'sendBatchEvents').mockResolvedValue(true);
  return { upsert, analytics };
}
afterEach(() => {
  for (const runtime of runtimes) runtime.destroy();
  runtimes.clear();
  vi.restoreAllMocks();
});

// Expose the actual Runtime payload boundary for a no-network spy.
class TestRuntime extends ContentfulExperiences {
  override fetchExperiencePayload(
    options: BuiltFetchExperienceOptions,
    resolveOptions: FetchResolveOptions
  ): Promise<ExperiencePayload> {
    return super.fetchExperiencePayload(options, resolveOptions);
  }
}

export function setupPayloadRuntime(
  config: Pick<Config, 'locale' | 'allowedEventTypes' | 'onEventBlocked'>,
  requestContext: RequestContext
) {
  const sdk = trackRuntime(
    new TestRuntime({
      ...payloadScope,
      delivery: { accessToken: 'token' },
      ...config,
    })
  );
  const fetch = vi.spyOn(sdk, 'fetchExperiencePayload').mockResolvedValue(payloadFixture());
  const commit = vi
    .spyOn(sdk.api.personalization, 'upsertProfile')
    .mockResolvedValue({ profile: profileFixture('committed-profile') } as never);
  const request = sdk.forRequest(requestContext);
  const options = {
    experienceId: 'experience',
    personalization: { events: [request.eventBuilder.buildIdentify({ userId: 'user' })] },
  };
  return { sdk, request, options, fetch, commit };
}

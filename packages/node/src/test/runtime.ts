import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
import type {
  BuiltRuntimeFetchExperienceOptions,
  RuntimeFetchResolveOptions,
} from '@contentful/experiences-runtime';
import { payloadFixture, payloadScope } from './fixtures/payload.js';
import { afterEach, vi } from 'vitest';
import { ContentfulExperiences, type ExperiencesNodeConfig } from '../contentful-experiences.js';
import type { ExperiencesNodeRequestContext } from '../request/types.js';
import { profileFixture } from './fixtures/profile.js';

const runtimes = new Set<ContentfulExperiences>();
export function trackRuntime<T extends ContentfulExperiences>(runtime: T): T {
  runtimes.add(runtime);
  return runtime;
}
export function createRuntime(overrides: Partial<ExperiencesNodeConfig> = {}) {
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
    .spyOn(sdk.api.experience, 'upsertProfile')
    .mockResolvedValue({ profile: profileFixture(responseProfileId) } as never);
  const analytics = vi.spyOn(sdk.api.insights, 'sendBatchEvents').mockResolvedValue(true);
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
    options: BuiltRuntimeFetchExperienceOptions,
    resolveOptions: RuntimeFetchResolveOptions
  ): Promise<ExperiencePayload> {
    return super.fetchExperiencePayload(options, resolveOptions);
  }
}

export function setupPayloadRuntime(
  config: Pick<ExperiencesNodeConfig, 'locale' | 'allowedEventTypes' | 'onEventBlocked'>,
  requestContext: ExperiencesNodeRequestContext
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
    .spyOn(sdk.api.experience, 'upsertProfile')
    .mockResolvedValue({ profile: profileFixture('committed-profile') } as never);
  const request = sdk.forRequest(requestContext);
  const options = {
    experienceId: 'experience',
    personalization: { events: [request.eventBuilder.buildIdentify({ userId: 'user' })] },
  };
  return { sdk, request, options, fetch, commit };
}

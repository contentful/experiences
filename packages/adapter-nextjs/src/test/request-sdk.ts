import { vi } from 'vitest';
import { createWebSnapshotRuntime, type ContentfulExperiences } from '@contentful/experiences-web';

export function appRequestSdkFixture() {
  const fetchExperience = vi.fn<ContentfulExperiences['fetchExperience']>();
  const hydrateAndTrackCurrentPage = vi.fn().mockResolvedValue({ accepted: true });
  const sdk = {
    ...createWebSnapshotRuntime({ consent: true }),
    spaceId: 'space',
    environmentId: 'master',
    config: {},
    fetchExperience,
    hydrateAndTrackCurrentPage,
    reset: vi.fn(),
    subscribeToPreview: () => ({ unsubscribe() {} }),
  } as unknown as ContentfulExperiences;
  return { sdk, fetchExperience, hydrateAndTrackCurrentPage };
}

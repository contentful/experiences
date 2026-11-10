import { createWebSnapshotRuntime, type ContentfulExperiences } from '@contentful/experiences-web';
import { vi } from 'vitest';

/** Small browser boundary double; consent and fetch outcome stay explicit. */
export function browserSdk(options: {
  consent?: boolean;
  plan: Awaited<ReturnType<ContentfulExperiences['fetchExperience']>>;
}) {
  const fetchExperience = vi
    .fn<ContentfulExperiences['fetchExperience']>()
    .mockResolvedValue(options.plan);
  const hydrateAndTrackCurrentPage = vi.fn().mockResolvedValue({ accepted: true });
  const sdk = {
    ...createWebSnapshotRuntime({ consent: options.consent }),
    spaceId: 'space',
    environmentId: 'master',
    config: {},
    fetchExperience,
    hydrateAndTrackCurrentPage,
    trackCurrentPage: vi.fn().mockResolvedValue({ accepted: true }),
    reset: vi.fn(),
    subscribeToPreview: () => ({ unsubscribe() {} }),
  } as unknown as ContentfulExperiences;
  return { sdk, fetchExperience, hydrateAndTrackCurrentPage };
}

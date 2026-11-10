import { vi } from 'vitest';
import { ContentfulExperiences, type Config } from '../contentful-experiences.js';
import { completeProfile } from './fixtures/profile.js';

/** Explicit package-local construction defaults; callers retain consent, transport and clock setup. */
export function createSdkHarness<T extends ContentfulExperiences>(
  defaults: Partial<Config>,
  Runtime: new (config: Config) => T
): { create: (config?: Partial<Config>) => T; destroy: () => void } {
  const runtimes = new Set<T>();
  return {
    create(config = {}) {
      const runtime = new Runtime({
        spaceId: 'space',
        environmentId: 'environment',
        delivery: { accessToken: 'delivery-token' },
        ...defaults,
        ...config,
      });
      runtimes.add(runtime);
      return runtime;
    },
    destroy() {
      for (const runtime of runtimes) runtime.destroy();
      runtimes.clear();
    },
  };
}

/** Observe the two real transports without taking over consent or identity setup. */
export function mockOptimization(
  runtime: ContentfulExperiences,
  profile = completeProfile('updated-profile')
) {
  return {
    upsertProfile: vi
      .spyOn(runtime.api.personalization, 'upsertProfile')
      .mockResolvedValue({ profile } as never),
    sendBatchEvents: vi.spyOn(runtime.api.analytics, 'sendBatchEvents').mockResolvedValue(true),
  };
}

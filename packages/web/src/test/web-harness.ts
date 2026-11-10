import { vi } from 'vitest';
import { ContentfulExperiences, type ExperiencesWebConfig } from '../contentful-experiences.js';
import { completeProfile } from './fixtures/profile.js';

/** Explicit package-local construction defaults; callers retain consent, transport and clock setup. */
export function createWebHarness<T extends ContentfulExperiences>(
  defaults: Partial<ExperiencesWebConfig>,
  Runtime: new (config: ExperiencesWebConfig) => T
): { create: (config?: Partial<ExperiencesWebConfig>) => T; destroy: () => void } {
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
      .spyOn(runtime.api.experience, 'upsertProfile')
      .mockResolvedValue({ profile } as never),
    sendBatchEvents: vi.spyOn(runtime.api.insights, 'sendBatchEvents').mockResolvedValue(true),
  };
}

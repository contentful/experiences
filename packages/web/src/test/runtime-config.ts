import type { ContentfulExperiences } from '../sdk/contentful-experiences.js';
import type { Config } from '../sdk/contentful-experiences.js';

/** Base credentials and locale only; visitor state and consent remain explicit at each call. */
export function createRuntimeConfig(overrides: Partial<Config> = {}): Config {
  return {
    spaceId: 'space',
    environmentId: 'environment',
    locale: 'en-US',
    delivery: { accessToken: 'delivery-token' },
    ...overrides,
  } as Config;
}

/** Records ownership only; each caller supplies its exact fresh configuration. */
export function createRuntimeFactory<T extends ContentfulExperiences>(
  runtimes: Set<T>,
  Runtime: new (config: Config) => T,
  defaults: () => Config
): (overrides?: Partial<Config>) => T {
  return (overrides = {}) => {
    const runtime = new Runtime({ ...defaults(), ...overrides });
    runtimes.add(runtime);
    return runtime;
  };
}

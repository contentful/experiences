import type { buildFetchPersonalization } from '@contentful/experiences-runtime';
import type { PersonalizationOptions as BuiltPersonalizationOptions } from '@contentful/experiences-client';

export type BuiltFetchOptions<T> = T extends unknown
  ? Omit<T, 'personalization'> & {
      personalization?: BuiltPersonalizationOptions;
    }
  : never;
export type PendingFetchOptions<T> = Omit<T, 'personalization'> & {
  personalization?: ReturnType<typeof buildFetchPersonalization>;
};

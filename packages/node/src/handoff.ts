import {
  createExperiencesHandoff,
  type EventProfile,
  type ExperiencesHandoff,
} from '@contentful/experiences-runtime';

/** Package completed request profile data without emitting events or making requests. */
export function createRequestHandoffFromData(input: {
  readonly spaceId: string;
  readonly environmentId: string;
  readonly data?: { readonly profile?: EventProfile };
  readonly cache?: Extract<ExperiencesHandoff['cache'], { scope: 'private-request' }>;
}): ExperiencesHandoff {
  const cache = input.cache ?? { scope: 'private-request' };
  if (cache.scope !== 'private-request') {
    throw new TypeError('Request handoffs must use private-request cache scope');
  }
  return createExperiencesHandoff({
    spaceId: input.spaceId,
    environmentId: input.environmentId,
    cache,
    ...(input.data?.profile === undefined ? {} : { state: { profile: input.data.profile } }),
  });
}

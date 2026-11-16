import {
  createExperiencesHandoff,
  type ChangeArray,
  EventProfileSchema,
  type EventProfile,
  type ExperiencesHandoff,
} from '@contentful/experiences-runtime';

/** Package request identity or completed profile data without emitting events or requests. */
export function createRequestHandoffFromData(input: {
  readonly spaceId: string;
  readonly environmentId: string;
  readonly data?: {
    readonly profile?: Pick<EventProfile, 'id'> | EventProfile;
    readonly changes?: ChangeArray;
  };
  readonly cache?: Extract<ExperiencesHandoff['cache'], { scope: 'private-request' }>;
}): ExperiencesHandoff {
  const cache = input.cache ?? { scope: 'private-request' };
  if (cache.scope !== 'private-request') {
    throw new TypeError('Request handoffs must use private-request cache scope');
  }
  const profile = input.data?.profile;
  const snapshot = EventProfileSchema.safeParse(profile);
  return createExperiencesHandoff({
    spaceId: input.spaceId,
    environmentId: input.environmentId,
    cache,
    ...(profile !== undefined && !snapshot.success ? { profileId: profile.id } : {}),
    ...(!snapshot.success && input.data?.changes === undefined
      ? {}
      : {
          state: {
            ...(snapshot.success ? { profile: snapshot.data } : {}),
            ...(input.data?.changes === undefined ? {} : { changes: input.data.changes }),
          },
        }),
  });
}

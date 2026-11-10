import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
import { profileFixture } from './profile.js';

export const payloadScope = { spaceId: 'space', environmentId: 'environment' };
export const payloadFixture = (profileId = 'xda-profile'): ExperiencePayload => ({
  sys: { type: 'Experience' },
  nodes: [],
  extensions: { personalization: { profile: profileFixture(profileId) } },
});

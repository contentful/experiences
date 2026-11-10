import {
  ChangeArray,
  EventProfileSchema,
  type BuiltFetchExperienceOptions,
  type EventProfile,
  type ExperiencesHandoff,
  type FetchExperienceForHandoffResult,
  type OptimizationEventStreamEvent,
  type FetchExperienceOptions,
  type FetchResolveOptions,
} from '@contentful/experiences-runtime';
import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
import type { ContentfulExperiences } from '../sdk/contentful-experiences.js';
import type { PersonalizationPreparation } from './personalization.js';
import type { RequestRuntime } from './types.js';
type HandoffIdentity = Pick<RequestRuntime, 'locale' | 'isPreview'> & {
  getProfile(): RequestRuntime['profile'];
  getRevision(): number;
  assertActive(): void;
  setProfile(profile: EventProfile): void;
};
/** Produce only the actual hybrid transfer's exact finalized event aggregate. */
export async function fetchHandoff(
  runtime: ContentfulExperiences,
  identity: HandoffIdentity,
  personalizationOwner: PersonalizationPreparation,
  fetchPayload: (
    options: BuiltFetchExperienceOptions,
    resolveOptions: FetchResolveOptions
  ) => Promise<ExperiencePayload>,
  options: FetchExperienceOptions,
  resolve: FetchResolveOptions,
  routeKey: string,
  handoff: ExperiencesHandoff
): Promise<FetchExperienceForHandoffResult> {
  const profileRevision = identity.getRevision();
  let expectedProfileId = identity.getProfile()?.id;
  let request = personalizationOwner.gate(options);
  const personalization = request.personalization;
  if (runtime.interceptors.event.count() > 0 && personalization?.events !== undefined) {
    const events: OptimizationEventStreamEvent[] = [];
    for (const event of personalization.events) {
      identity.assertActive();
      events.push(await runtime.interceptors.event.run(event));
      identity.assertActive();
    }
    request = personalizationOwner.finalize(request, { ...personalization, events });
  } else {
    request = personalizationOwner.finalize(request);
  }
  identity.assertActive();
  const profileId = request.personalization?.profileId;
  if (!identity.isPreview) {
    handoff = { ...handoff, profileId };
    if (request.personalization?.events?.length) {
      handoff = {
        ...handoff,
        replay: {
          routeKey,
          events: request.personalization.events,
          locale: request.locale ?? identity.locale,
        },
      };
    }
  }
  const assertCurrent = () => {
    identity.assertActive();
    if (
      identity.getProfile()?.id !== expectedProfileId &&
      identity.getProfile()?.id !== profileId
    ) {
      throw new Error('Experiences fetch was superseded');
    }
  };
  try {
    assertCurrent();
    const payload = await fetchPayload(request, resolve);
    assertCurrent();
    const returnedProfile = payload.extensions?.personalization?.profile;
    if (!identity.isPreview && returnedProfile !== undefined) {
      const profile = EventProfileSchema.parse(returnedProfile);
      handoff = { ...handoff, profileId: profile.id, state: { profile } };
      if (identity.getRevision() === profileRevision) {
        identity.setProfile(profile);
        expectedProfileId = profile.id;
      }
    }
    const changes = payload.extensions?.personalization?.changes;
    if (!identity.isPreview && changes !== undefined) {
      handoff = { ...handoff, state: { ...handoff.state, changes: ChangeArray.parse(changes) } };
    }
    const plan = await runtime.resolveExperience(payload, resolve);
    assertCurrent();
    return { handoff, plan };
  } catch (error) {
    assertCurrent();
    return { handoff, error };
  }
}

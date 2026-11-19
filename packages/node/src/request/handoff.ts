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
import type { DestinationRedirectResult } from '@contentful/experiences-client';
import type { BuiltFetchOptions } from './personalization.js';
import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
import type { ContentfulExperiences } from '../sdk/contentful-experiences.js';
import type { RequestPersonalization } from './personalization.js';
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
  personalizationOwner: RequestPersonalization,
  fetchPayload: (
    options: BuiltFetchExperienceOptions,
    resolveOptions: FetchResolveOptions
  ) => Promise<ExperiencePayload | DestinationRedirectResult>,
  options: FetchExperienceOptions,
  resolve: FetchResolveOptions,
  routeKey: string,
  handoff: ExperiencesHandoff
): Promise<FetchExperienceForHandoffResult> {
  const profileRevision = identity.getRevision();
  let expectedProfileId = identity.getProfile()?.id;
  const gated = personalizationOwner.gate(options);
  if (gated.personalization !== undefined) {
    gated.personalization = { ...gated.personalization, preflight: true };
  }
  const personalization = gated.personalization;
  let request: BuiltFetchOptions<FetchExperienceOptions>;
  if (runtime.interceptors.event.count() > 0 && personalization?.events !== undefined) {
    const events: OptimizationEventStreamEvent[] = [];
    for (const event of personalization.events) {
      identity.assertActive();
      events.push(await runtime.interceptors.event.run(event));
      identity.assertActive();
    }
    request = personalizationOwner.finalize<FetchExperienceOptions>(gated, {
      ...personalization,
      events,
    });
  } else {
    request = personalizationOwner.finalize<FetchExperienceOptions>(gated);
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
    if ('redirect' in payload) return { handoff, redirect: payload.redirect };
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

export function assertHandoffRequest(
  options: FetchExperienceOptions,
  replay: { readonly routeKey: string }
): void {
  if (
    options.personalization?.preflight !== undefined &&
    options.personalization.preflight !== true
  ) {
    throw new TypeError('Request handoff requires personalization.preflight: true');
  }
  if (typeof replay?.routeKey !== 'string' || !replay.routeKey.startsWith('/')) {
    throw new TypeError('Request handoff requires a pathname/search route key');
  }
}

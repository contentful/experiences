import { expect, it } from 'vitest';
import { ContentfulExperiences, type ExperiencePayload } from '@contentful/experiences-node';
import { createPageContext } from '../../request/context.js';
import { serializeHandoff } from '../../cache/serialization.js';

const scope = { spaceId: 'space', environmentId: 'master' };

it('serializes the actual Node producer replay after content failure with absent nested SDK fields', async () => {
  const failure = new Error('content failed');
  class FailedContentRuntime extends ContentfulExperiences {
    override async fetchExperiencePayload(): Promise<ExperiencePayload> {
      throw failure;
    }
  }
  const sdk = new FailedContentRuntime({ ...scope, delivery: { accessToken: 'test' } });
  const pageContext = createPageContext({
    path: '/page',
    url: 'https://example.com/page?q=first&q=last',
  });
  pageContext.title = undefined;
  const request = sdk.forRequest({
    consent: true,
    profile: { id: 'incoming' },
    locale: 'de-DE',
    eventContext: {
      page: pageContext,
      campaign: { name: 'launch', medium: undefined },
      location: { countryCode: 'DE', city: undefined },
    },
  });
  try {
    const event = request.eventBuilder.buildPageView();
    Object.assign(event.context.page!, { hash: undefined, width: undefined, height: undefined });
    Object.assign(event.properties, { title: undefined, category: undefined });
    const result = await request.fetchExperienceForHandoff(
      { experienceId: 'home', personalization: { events: [event] } },
      { config: { components: {} } },
      { routeKey: '/page?q=first&q=last' }
    );
    const original = globalThis.structuredClone(result.handoff);
    const output = serializeHandoff(result.handoff, scope);
    expect(output.profileId).toBe('incoming');
    expect(output).toEqual(JSON.parse(JSON.stringify(result.handoff)));
    expect(result.handoff).toEqual(original);
  } finally {
    request.destroy();
    sdk.destroy();
  }
});

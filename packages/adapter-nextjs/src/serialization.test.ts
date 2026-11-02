import { describe, expect, it, vi } from 'vitest';
import { createNextjsPageContext } from './request-context.js';
import { EventBuilder } from '@contentful/experiences-react/server';
import {
  ContentfulExperiences,
  parseExperiencesHandoffEnvelope,
  type EventProfile,
  type ExperiencePayload,
  type ExperiencesHandoff,
  type PortableRenderPlan,
} from '@contentful/experiences-node';
import {
  serializeNextjsHandoff,
  serializeNextjsJsonForHtml,
  serializeNextjsPlan,
} from './serialization.js';

const scope = { spaceId: 'space', environmentId: 'master' };
const builder = new EventBuilder({ channel: 'server', library: { name: 'test', version: '1' } });
function handoff(events: NonNullable<ExperiencesHandoff['replay']>['events']): ExperiencesHandoff {
  return { ...scope, cache: { scope: 'private-request' }, replay: { routeKey: '/page', events } };
}
function profile(): EventProfile {
  const value: EventProfile = {
    id: 'final',
    stableId: 'stable',
    random: 0.5,
    audiences: ['audience'],
    traits: { plan: 'pro' },
    jurisdiction: undefined,
    location: { countryCode: 'DE', city: undefined },
    session: {
      id: undefined,
      isReturningVisitor: true,
      landingPage: {
        path: '/',
        query: {},
        referrer: '',
        search: '',
        url: 'https://example.com/',
      },
      count: 2,
      activeSessionLength: 10,
      averageSessionLength: 20,
    },
  };
  value.session.landingPage.title = undefined;
  return value;
}
function plan(): PortableRenderPlan {
  return {
    nodes: [
      {
        nodeId: undefined,
        registration: { kind: 'component', id: 'card' },
        props: { content: { text: '<hello>' }, design: {}, designRaw: {}, resolved: undefined },
        slots: {},
      },
    ],
    diagnostics: [new Error('private diagnostic')],
    deliveryDiagnostics: [{ fieldPath: 'secret', message: 'private' }],
    personalization: { profile: profile() },
    metadata: { private: () => 'server', approved: { public: true } },
    debug: false,
    attribution: {
      scopes: {
        root: {
          key: 'root',
          entityId: 'home',
          entityKind: 'Experience',
          variantId: 'default',
          optimizationId: undefined,
        },
      },
    },
  };
}

describe('browser plan projection', () => {
  it('preserves render data and attribution while excluding diagnostic/identity/default metadata', () => {
    const input = plan();
    const output = serializeNextjsPlan(input);
    expect(output).toEqual({
      nodes: [
        {
          registration: { kind: 'component', id: 'card' },
          props: { content: { text: '<hello>' }, design: {}, designRaw: {} },
          slots: {},
        },
      ],
      diagnostics: [],
      metadata: {},
      debug: false,
      attribution: {
        scopes: {
          root: { key: 'root', entityId: 'home', entityKind: 'Experience', variantId: 'default' },
        },
      },
    });
    expect(serializeNextjsPlan(input, { metadataKeys: ['approved'] }).metadata).toEqual({
      approved: { public: true },
    });
    expect(input.diagnostics).toHaveLength(1);
    expect(input.nodes[0]!.props).toHaveProperty('resolved');
    expect(output.nodes).not.toBe(input.nodes);
  });

  it.each([() => undefined, Symbol('x'), 1n, Infinity, NaN, new Date(), new Map(), undefined])(
    'rejects invalid application props with a precise path: %s',
    (value) => {
      const input = plan();
      input.nodes[0]!.props.resolved = { invalid: value };
      expect(() => serializeNextjsPlan(input)).toThrow('$.nodes[0].props.resolved.invalid');
    }
  );

  it('rejects cycles, getters, symbol keys and invalid explicitly allowed metadata', () => {
    const input = plan();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    input.nodes[0]!.props.content = cyclic;
    expect(() => serializeNextjsPlan(input)).toThrow('cycle at $.nodes[0].props.content.self');
    const recursive = plan();
    recursive.nodes[0]!.slots.loop = recursive.nodes;
    expect(() => serializeNextjsPlan(recursive)).toThrow('cycle at $.nodes[0].slots.loop');
    input.nodes[0]!.props.content = {
      get secret() {
        throw new Error('must not execute');
      },
    };
    expect(() => serializeNextjsPlan(input)).toThrow('accessor');
    input.nodes[0]!.props.content = { [Symbol('private')]: 'value' };
    expect(() => serializeNextjsPlan(input)).toThrow('symbol key');
    expect(() => serializeNextjsPlan(plan(), { metadataKeys: ['private'] })).toThrow(
      '$.metadata.private'
    );
  });

  it('preserves arbitrary slot names, source maps and shared non-cyclic references', () => {
    const input = plan();
    const shared = { nested: 'value' };
    input.nodes[0]!.props.content = { first: shared, second: shared };
    input.nodes[0]!.slots['name.with/slash'] = [plan().nodes[0]!];
    const scope = input.attribution!.scopes.root!;
    input.nodes[0]!.attribution = { scopes: [scope], roots: [scope], entryIds: undefined };
    input.sourceMap = {
      version: 1,
      variants: [],
      spaces: [],
      environments: [],
      locales: [],
      entries: [],
      assets: [],
      layers: [],
      dataAssemblies: [],
      nodes: {},
    };
    const output = serializeNextjsPlan(input);
    expect(output.sourceMap).toEqual(input.sourceMap);
    expect(output.nodes[0]!.slots['name.with/slash']).toHaveLength(1);
    const projected = output.attribution!.scopes.root!;
    expect(output.nodes[0]!.attribution).toEqual({ scopes: [projected], roots: [projected] });
    expect(JSON.parse(JSON.stringify(output))).toEqual(output);
  });
});

describe('canonical handoff serialization', () => {
  it('preserves exact intent, continuation identity and complete profile state', () => {
    const events = [builder.buildIdentify({ userId: 'user' }), builder.buildPageView()];
    const input: ExperiencesHandoff = {
      ...scope,
      cache: { scope: 'private-request' },
      profileId: 'continuation',
      state: { profile: profile() },
      replay: { routeKey: '/page?q=x&q=y', events, locale: 'de-DE' },
    };
    const output = serializeNextjsHandoff(input, scope);
    expect(output.state).toEqual(JSON.parse(JSON.stringify(input.state)));
    expect(parseExperiencesHandoffEnvelope(output, scope)).toEqual(output);
    expect(output.profileId).toBe('continuation');
    expect(output.replay).toEqual(JSON.parse(JSON.stringify(input.replay)));
    expect(input.state?.profile?.traits).toEqual({ plan: 'pro' });
    expect(JSON.parse(serializeNextjsJsonForHtml(output))).toEqual(output);
  });

  it('supports profileless output and delegates scope/cache rejection to the canonical owner', () => {
    const input: ExperiencesHandoff = { ...scope, cache: { scope: 'private-request' } };
    expect(serializeNextjsHandoff(input, scope)).toEqual(input);
    expect(() => serializeNextjsHandoff(input, { ...scope, environmentId: 'other' })).toThrow(
      'space or environment'
    );
    expect(() =>
      serializeNextjsHandoff({ ...input, profileId: 'private', cache: { scope: 'static' } }, scope)
    ).toThrow('public');
    expect(() =>
      serializeNextjsHandoff({ ...input, cache: { scope: 'public-permutation', key: ' ' } }, scope)
    ).toThrow('key');
  });
});

it('escapes HTML script terminators and JS line separators without changing JSON values', () => {
  const input = { text: '</script><script>\u2028\u2029' };
  const encoded = serializeNextjsJsonForHtml(input);
  expect(encoded).toBe('{"text":"\\u003c/script>\\u003cscript>\\u2028\\u2029"}');
  expect(JSON.parse(encoded)).toEqual(input);
});

it('serializes the actual Node producer replay after content failure with absent nested SDK fields', async () => {
  const failure = new Error('content failed');
  class FailedContentRuntime extends ContentfulExperiences {
    override async fetchExperiencePayload(): Promise<ExperiencePayload> {
      throw failure;
    }
  }
  const sdk = new FailedContentRuntime({ ...scope, delivery: { accessToken: 'test' } });
  const payload = vi.spyOn(sdk, 'fetchExperiencePayload');
  const pageContext = createNextjsPageContext({
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
    expect(payload).toHaveBeenCalledOnce();
    expect(result.error).toBe(failure);
    expect(result.plan).toBeUndefined();
    const original = globalThis.structuredClone(result.handoff);
    const output = serializeNextjsHandoff(result.handoff, scope);
    expect(output.profileId).toBe('incoming');
    expect(output).toEqual(JSON.parse(JSON.stringify(result.handoff)));
    expect(result.handoff).toEqual(original);
  } finally {
    request.destroy();
    sdk.destroy();
  }
});

it('preserves defined context fields and raw query arrays while keeping customer fields strict', () => {
  const event = builder.buildIdentify({ userId: 'user', traits: { medium: 'customer' } });
  const page = {
    path: '/page',
    search: '?q=first&q=last',
    query: { q: ['first', 'last'] },
    referrer: '',
    url: 'https://example.com/page',
    title: 'Defined',
    custom: 'kept',
  };
  const input = handoff([
    {
      ...event,
      context: { ...event.context, page, campaign: { medium: 'email', term: undefined } },
    } as never,
  ]);
  const output = serializeNextjsHandoff(input, scope);
  expect(output.replay?.events[0]?.context.page).toEqual(page);
  expect(output.replay?.events[0]?.context.campaign).toEqual({ medium: 'email' });
  expect(output.replay?.events[0]).toMatchObject({ traits: { medium: 'customer' } });
  const rawEvent = input.replay!.events[0]!;
  Object.assign(rawEvent, { traits: { medium: undefined } });
  expect(() => serializeNextjsHandoff(input, scope)).toThrow('$.replay.events[0].traits.medium');
  Object.assign(rawEvent, { traits: {} });
  Object.assign(rawEvent.context.page!, { custom: undefined });
  expect(() => serializeNextjsHandoff(input, scope)).toThrow(
    '$.replay.events[0].context.page.custom'
  );
});

it('preserves defined page optionals and keeps page extensions, Track properties and Identify traits strict', () => {
  const page = builder.buildPageView();
  Object.assign(page.context.page!, {
    title: 'Title',
    hash: '#section',
    width: 640,
    height: 480,
    extension: 'context',
  });
  Object.assign(page.properties, {
    title: 'Title',
    category: 'docs',
    hash: '#section',
    width: 640,
    height: 480,
    extension: 'property',
  });
  const input = handoff([page]);
  const original = globalThis.structuredClone(input);
  const output = serializeNextjsHandoff(input, scope);
  expect(output.replay?.events[0]?.context.page).toEqual(page.context.page);
  expect(output.replay?.events[0]).toMatchObject({ properties: page.properties });
  expect(input).toEqual(original);
  Object.assign(page.properties, { extension: undefined });
  expect(() => serializeNextjsHandoff(input, scope)).toThrow(
    '$.replay.events[0].properties.extension'
  );

  const track = builder.buildTrack({ event: 'custom' });
  Object.assign(track.properties, { title: undefined, category: undefined });
  expect(() => serializeNextjsHandoff(handoff([track]), scope)).toThrow(
    '$.replay.events[0].properties.title'
  );
  const identify = builder.buildIdentify({ userId: 'user' });
  Object.assign(identify.traits, { title: undefined, category: undefined });
  expect(() => serializeNextjsHandoff(handoff([identify]), scope)).toThrow(
    '$.replay.events[0].traits.title'
  );
});

import { describe, expect, expectTypeOf, it } from 'vitest';
import { EventBuilder } from '@contentful/experiences-runtime';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import { projectRequestResult, type RawRequestResult } from './request-projection.js';

const scope = { spaceId: 'space', environmentId: 'master' };
const base = {
  requestId: 'request-1',
  routeKey: '/home?tag=a&tag=b',
  experience: { experienceId: 'home' },
};
const sourceMap = {
  version: 1,
  variants: [],
  spaces: ['space'],
  environments: ['master'],
  locales: ['en-US'],
  entries: [],
  assets: [],
  layers: [],
  dataAssemblies: [],
  nodes: {},
};
const attribution = {
  scopes: { root: { key: 'root', entityId: 'home', entityKind: 'Experience' as const } },
};
const plan = (): PortableRenderPlan => ({
  nodes: [],
  debug: false,
  metadata: {},
  diagnostics: [],
  sourceMap,
  attribution,
});
const project = (raw: RawRequestResult) => projectRequestResult(raw, scope);

describe('Kit complete result projection', () => {
  it('retains content and request provenance while removing private state, raw diagnostics and metadata', () => {
    const input = {
      ...base,
      experience: {
        experienceId: 'home',
        parameters: { category: 'news' },
        personalization: { profileId: 'visitor', events: [] },
      },
      plan: {
        ...plan(),
        nodes: [
          {
            registration: { kind: 'component' as const, id: 'card' },
            nodeId: undefined,
            props: {
              content: { title: 'Hello' },
              design: { color: 'red' },
              designRaw: {},
              resolved: undefined,
            },
            slots: {},
          },
        ],
        metadata: { public: { heading: 'Hello' }, secret: 'credential' },
        diagnostics: [new Error('secret')],
        deliveryDiagnostics: [{ fieldPath: 'secret', message: 'secret' }],
        personalization: { profile: { id: 'visitor' } },
      } as unknown as PortableRenderPlan,
      initialPageOwner: 'server' as const,
      initialPagePayload: { properties: { title: 'Home' } },
      preview: {
        sessionHost: 'https://preview.example',
        accessToken: 'secret',
        createClient: () => undefined,
      } as RawRequestResult['preview'],
    };
    const output = projectRequestResult(input, { ...scope, metadataKeys: ['public'] });
    expectTypeOf(output.experience).toMatchTypeOf<{ readonly experienceId: string }>();
    expect(output).toMatchObject({
      requestId: base.requestId,
      routeKey: base.routeKey,
      experience: {
        experienceId: 'home',
        parameters: { category: 'news' },
        personalization: { events: [] },
      },
      initialPageOwner: 'server',
      initialPagePayload: input.initialPagePayload,
      preview: { sessionHost: 'https://preview.example' },
    });
    expect(output.plan).toEqual({
      ...plan(),
      nodes: [
        {
          registration: { kind: 'component', id: 'card' },
          props: { content: { title: 'Hello' }, design: { color: 'red' }, designRaw: {} },
          slots: {},
        },
      ],
      metadata: { public: { heading: 'Hello' } },
    });
    expect(JSON.stringify(output)).not.toContain('secret');
    expect(output.plan).not.toBe(input.plan);
  });

  it('keeps event-free reads distinct from an explicit no-page event list', () => {
    const read = projectRequestResult(
      {
        ...base,
        experience: { experienceId: 'home' as const, locale: 'en-US' as const },
        eventFree: true,
      },
      scope
    );
    expectTypeOf(read.experience).toMatchTypeOf<{
      readonly experienceId: 'home';
      readonly locale: 'en-US';
    }>();
    expect(read.experience).not.toHaveProperty('personalization');
    expect(
      project({ ...base, experience: { ...base.experience, personalization: { events: [] } } })
    ).toMatchObject({ experience: { personalization: { events: [] } } });
    expect(
      project({
        ...base,
        experience: { ...base.experience, personalization: { events: [{ type: 'page' }] } },
      }).experience
    ).not.toHaveProperty('personalization');
  });

  it.each([
    [{ statusCode: 404 }, 'not-found', true],
    [
      Object.assign(new Error('private session body'), {
        name: 'PreviewSessionFetchError',
        statusCode: 404,
      }),
      'preview',
      false,
    ],
    [
      Object.assign(new Error('private auth body'), {
        name: 'ExperienceFetchError',
        cause: { statusCode: 403 },
      }),
      'authorization',
      false,
    ],
    [new Error('private transport body'), 'unavailable', false],
  ])('projects safe failure meaning without backend details', (error, kind, missing) => {
    const output = project({ ...base, error, initialPageOwner: 'server' });
    expect(output.contentErrorKind).toBe(kind);
    expect(output.notFound === true).toBe(missing);
    expect(output.initialPageOwner).toBe('server');
    expect(JSON.stringify(output)).not.toContain('private');
    expect(output).not.toHaveProperty('error');
  });

  it('treats empty content as success', () => {
    const output = project({ ...base, plan: plan() });
    expect(output.plan?.nodes).toEqual([]);
    expect(output).not.toHaveProperty('notFound');
    expect(output).not.toHaveProperty('contentError');
  });

  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  const customArray = Object.assign(['item'], { extra: 'private' });
  const hiddenArray = ['item'];
  Object.defineProperty(hiddenArray, 'hidden', { value: true });
  const accessor = Object.defineProperty({}, 'secret', {
    enumerable: true,
    get() {
      throw new Error('Accessor invoked');
    },
  });
  const hiddenAccessor = Object.defineProperty({}, 'secret', {
    get() {
      throw new Error('Accessor invoked');
    },
  });
  it.each([
    undefined,
    () => undefined,
    Symbol('value'),
    NaN,
    Infinity,
    new Date(),
    cyclic,
    customArray,
    hiddenArray,
    accessor,
    hiddenAccessor,
    { [Symbol('key')]: true },
    new Array(1),
  ])('rejects unsupported application JSON rather than silently corrupting it (%#)', (value) => {
    expect(() =>
      project({
        ...base,
        plan: {
          ...plan(),
          metadata: {},
          nodes: [
            {
              registration: { kind: 'component', id: 'card' },
              props: { content: { value }, design: {}, designRaw: {} },
              slots: {},
            },
          ],
        },
      })
    ).toThrow(TypeError);
  });

  it('rejects accessors in inspected private selector intent without invoking them', () => {
    const intent = Object.defineProperty({}, 'events', {
      get() {
        throw new Error('Accessor invoked');
      },
    });
    expect(() =>
      project({ ...base, experience: { ...base.experience, personalization: intent } })
    ).toThrow(TypeError);
    const events = Object.defineProperty([{ type: 'page' as const }], '0', {
      get() {
        throw new Error('Accessor invoked');
      },
    });
    expect(() =>
      project({ ...base, experience: { ...base.experience, personalization: { events } } })
    ).toThrow(TypeError);
  });

  it('preserves exact canonical producer replay, including query arrays, independently of content failure', () => {
    const builder = new EventBuilder({
      channel: 'server',
      library: { name: 'test', version: '1' },
    });
    const event = builder.buildPageView({
      page: {
        path: '/home',
        referrer: '',
        search: '?tag=a&tag=b',
        url: 'https://example.com/home?tag=a&tag=b',
        query: { tag: ['a', 'b'] },
      },
    });
    const handoff = {
      ...scope,
      cache: { scope: 'private-request' as const },
      profileId: 'visitor',
      state: {
        profile: {
          id: 'visitor',
          stableId: 'visitor',
          random: 0.5,
          audiences: [],
          traits: {},
          location: {},
          session: {
            isReturningVisitor: false,
            landingPage: {
              url: 'https://example.com/',
              path: '/',
              query: {},
              referrer: '',
              search: '',
            },
            count: 1,
            activeSessionLength: 0,
            averageSessionLength: 0,
          },
        },
        changes: [],
      },
      replay: { routeKey: base.routeKey, events: [event] },
    };
    const output = project({ ...base, error: new Error('unavailable'), handoff });
    expect(output.handoff).toEqual(JSON.parse(JSON.stringify(handoff)));
    expect(output.contentErrorKind).toBe('unavailable');
    expect(() => project({ ...base, handoff: { ...handoff, spaceId: 'other' } })).toThrow();
    expect(() =>
      project({ ...base, handoff: { ...handoff, cache: { scope: 'static' } } })
    ).toThrow();
    expect(() =>
      projectRequestResult({ ...base, handoff }, { ...scope, isPreview: true })
    ).toThrow();
    expect(() =>
      projectRequestResult({ ...base, handoff }, { ...scope, prerender: true })
    ).toThrow();
  });

  it('refuses visitor intent during prerender while allowing static event-free content', () => {
    expect(() =>
      projectRequestResult(
        { ...base, experience: { ...base.experience, personalization: { events: [] } } },
        { ...scope, prerender: true }
      )
    ).toThrow('Prerender');
    expect(
      projectRequestResult(
        { ...base, plan: plan(), eventFree: true },
        { ...scope, prerender: true }
      ).plan?.nodes
    ).toEqual([]);
  });
});

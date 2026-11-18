import type { RequestEvent } from '@sveltejs/kit';
import { beforeEach, expect, it, vi } from 'vitest';
import { createSvelteKitServerBinding } from './server-binding.js';
import { parsePreparationInput } from './request-protocol.js';
import type { ServerBindingOptions } from './server-types.js';

const { operation } = vi.hoisted(() => ({ operation: vi.fn() }));
vi.mock('./server-operation.js', () => ({ createServerOperation: () => operation }));

const input = {
  operation: 'prepare',
  routeKey: '/base/page?a=1&a=2',
  experience: { experienceId: 'primary' },
};
const result = { requestId: 'request', routeKey: input.routeKey, experience: input.experience };
const options = { endpoint: '/api/experiences' } as ServerBindingOptions;

function event(method = 'GET', url = 'https://example.com/base/page?a=1&a=2') {
  return {
    url: new URL(url),
    request: new globalThis.Request(url, { method }),
    isDataRequest: false,
    isSubRequest: false,
    setHeaders: vi.fn(),
  } as unknown as RequestEvent;
}

function request(body: unknown = input, origin?: string) {
  return new globalThis.Request('https://example.com/api/experiences', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  operation.mockReset();
  operation.mockResolvedValue(result);
});

it('captures one document primary through native fetch with original query and private headers', async () => {
  const binding = createSvelteKitServerBinding(options);
  const outer = event();
  const fetch = vi.fn();
  const responses = await Promise.all(
    [0, 1].map(() => binding.request.handleFetch({ event: outer, request: request(), fetch }))
  );
  expect(operation).toHaveBeenCalledOnce();
  expect(operation).toHaveBeenCalledWith(outer, input, { document: true });
  expect(outer.setHeaders).toHaveBeenCalledExactlyOnceWith({
    'cache-control': 'private, no-store',
  });
  expect(await responses[0]!.json()).toEqual(result);
  expect(responses[0]!.headers.get('cache-control')).toBe('private, no-store');
  const conflict = await binding.request.handleFetch({
    event: outer,
    request: request({ ...input, experience: { experienceId: 'other' } }),
    fetch,
  });
  expect(conflict.status).toBe(409);
  expect(operation).toHaveBeenCalledOnce();
});

it.each(['data', 'subrequest', 'route', 'method'])(
  'does not give %s fetches document authority',
  async (kind) => {
    const outer = event(kind === 'method' ? 'POST' : 'GET');
    if (kind === 'data') outer.isDataRequest = true;
    if (kind === 'subrequest') outer.isSubRequest = true;
    const body = kind === 'route' ? { ...input, routeKey: '/different' } : input;
    await createSvelteKitServerBinding(options).request.handleFetch({
      event: outer,
      request: request(body),
      fetch: vi.fn(),
    });
    expect(operation).toHaveBeenCalledWith(outer, body, { document: false });
  }
);

it('requires same-origin public requests and never grants them document authority', async () => {
  const binding = createSvelteKitServerBinding(options);
  for (const origin of [undefined, 'https://foreign.example', 'null']) {
    const outer = event();
    outer.request = request(input, origin);
    expect((await binding.request.handlePreparation(outer)).status).toBe(403);
  }
  expect(operation).not.toHaveBeenCalled();
  const outer = event();
  outer.request = request(input, 'https://example.com');
  expect((await binding.request.handlePreparation(outer)).status).toBe(200);
  expect(operation).toHaveBeenCalledWith(outer, input, { document: false });
  expect(outer.setHeaders).not.toHaveBeenCalled();
});

it.each([
  ['purpose', 'prefetch'],
  ['purpose', 'prerender'],
  ['sec-purpose', 'prefetch'],
  ['sec-purpose', 'prefetch;prerender'],
  ['sec-purpose', 'PRERENDER'],
])('keeps speculative documents noncommitting through outer %s: %s', async (header, value) => {
  const outer = event();
  outer.request.headers.set(header, value);
  // The captured preparation POST has no speculative header of its own.
  await createSvelteKitServerBinding(options).request.handleFetch({
    event: outer,
    request: request(),
    fetch: vi.fn(),
  });
  expect(operation).toHaveBeenCalledWith(outer, input, { document: false });
});

it('forwards unrelated native requests unchanged', async () => {
  const binding = createSvelteKitServerBinding(options);
  const fetch = vi.fn().mockResolvedValue(new globalThis.Response('forwarded'));
  for (const target of [
    'https://foreign.example/api/experiences',
    'https://example.com/other',
    'https://example.com/api/experiences?q=1',
  ]) {
    const original = new globalThis.Request(target, { method: 'POST', body: 'untouched' });
    await binding.request.handleFetch({ event: event(), request: original, fetch });
    expect(fetch).toHaveBeenLastCalledWith(original);
    expect(original.bodyUsed).toBe(false);
  }
  expect(operation).not.toHaveBeenCalled();
});

it('rejects build-time preparation before creating visitor work', async () => {
  const response = await createSvelteKitServerBinding(options, {
    building: true,
  }).request.handleFetch({ event: event(), request: request(), fetch: vi.fn() });
  expect(response.status).toBe(503);
  expect(operation).not.toHaveBeenCalled();
});

it.each([
  { ...input, mode: 'ssr' },
  { ...input, preview: { sessionId: 'private' } },
  { ...input, experience: { experienceId: 'primary', accessToken: 'secret' } },
  { ...input, experience: { experienceId: 'primary', spaceId: 'other' } },
  { ...input, resolveOptions: { config: {} } },
  { ...input, eventContext: { headers: {} } },
  { ...input, routeKey: '//other.example/path' },
  { ...input, routeKey: '/path#hash' },
  { ...input, routeKey: '/path\\escape' },
  { ...input, routeKey: '/a/../b' },
  { ...input, routeKey: '/foo?' },
])('rejects invalid or privileged wire fields before operation work: %j', async (body) => {
  const response = await createSvelteKitServerBinding(options).request.handleFetch({
    event: event(),
    request: request(body),
    fetch: vi.fn(),
  });
  expect(response.status).toBe(400);
  expect(operation).not.toHaveBeenCalled();
});

it('enforces the byte cap on streamed bodies without trusting Content-Length', async () => {
  const oversized = new globalThis.Request('https://example.com/api/experiences', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': '1' },
    body: JSON.stringify({ ...input, resolveOptions: { metadata: { value: 'x'.repeat(65536) } } }),
  });
  const response = await createSvelteKitServerBinding(options).request.handleFetch({
    event: event(),
    request: oversized,
    fetch: vi.fn(),
  });
  expect(response.status).toBe(400);
  expect(operation).not.toHaveBeenCalled();
});

it('preserves supported parameters, extensions, builder intent and raw event bodies', () => {
  const supported = {
    ...input,
    experience: {
      experienceId: 'primary',
      parameters: { title: 'value', width: 10, group: { leaf: 'value' } },
      extensions: { sourceMap: {} },
      personalization: {
        profileId: 'visitor',
        events: [
          { type: 'page', title: 'Page', page: { query: { item: ['one', 'two'] } } },
          { type: 'track', event: 'custom', properties: { arbitrary: true }, context: {} },
        ],
      },
    },
  };
  expect(parsePreparationInput(supported)).toEqual(supported);
  expect(() =>
    parsePreparationInput({ ...input, resolveOptions: { metadata: { number: Infinity } } })
  ).toThrow();
  let deep: unknown = {};
  for (let index = 0; index < 30; index++) deep = { next: deep };
  expect(() => parsePreparationInput({ ...input, resolveOptions: { metadata: deep } })).toThrow();
});

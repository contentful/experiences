import { describe, expect, it, vi } from 'vitest';
import type { RuntimeOwner } from '../runtime/owner-controller.svelte.js';
import { createClientLoader } from './client-loader.js';
import {
  getRequestSourceState,
  requestSelection,
  type ManagedRequestSource,
} from './request-source.js';

describe('native universal Experience loading', () => {
  it('joins one primary per load and selects event-free reads for the same URL and content selection', async () => {
    let committed: ManagedRequestSource | undefined;
    let selection: string | undefined;
    let locale = 'en-US';
    const owner = {
      current: {
        status: 'ready',
        sdk: {
          get locale() {
            return locale;
          },
          config: {},
          captureLifetime: () => () => true,
          capturePreparation: () => ({
            inputs: { profileId: 'browser', locale, consent: { events: true, persistence: true } },
            isCurrent: () => true,
          }),
        },
      },
    } as unknown as RuntimeOwner;
    const getOwner = vi.fn(() => owner);
    const bodies: Record<string, unknown>[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      return new globalThis.Response(
        JSON.stringify({
          requestId: String(bodies.length),
          routeKey: body.routeKey,
          experience: body.experience,
          eventFree: body.operation === 'read',
        })
      );
    });
    const load = createClientLoader({
      endpoint: '/_exo/primary',
      getOwner,
      getCommittedSource: () => committed,
      getCommittedSelection: () => selection,
      initializedBeforeLoad: () => false,
    });
    const event = { url: new URL('https://example.test/a?x=1#hash'), fetch, depends: vi.fn() };
    const input = { experience: { experienceId: 'a', parameters: { choice: 'one' } } };
    const first = load(event, input);
    expect(load(event, input)).toBe(first);
    expect(() => load(event, { experience: { experienceId: 'other' } })).toThrow(/one primary/);
    committed = await first;
    expect(getOwner).not.toHaveBeenCalled();
    expect(bodies[0]).toEqual({
      operation: 'prepare',
      routeKey: '/a?x=1',
      experience: input.experience,
    });
    expect(event.depends).toHaveBeenCalledWith('exo:primary');
    selection = requestSelection({ ...getRequestSourceState(committed), locale });
    const read = await load({ ...event }, input);
    expect(getRequestSourceState(read).result?.eventFree).toBe(true);
    expect(bodies[1]).toMatchObject({ operation: 'read', locale: 'en-US', profileId: 'browser' });
    await load(
      { ...event },
      { experience: { ...input.experience, parameters: { choice: 'two' } } }
    );
    locale = 'de-DE';
    await load({ ...event }, input);
    expect(bodies.slice(2).map((body) => body.operation)).toEqual(['prepare', 'prepare']);
  });

  it('validates selectors before startup and leaves failed init inert', async () => {
    const getOwner = vi.fn(
      () =>
        ({ current: { status: 'error', error: new Error('startup') } }) as unknown as RuntimeOwner
    );
    const fetch = vi.fn();
    const load = createClientLoader({
      endpoint: '/_exo/primary',
      getOwner,
      initializedBeforeLoad: () => true,
      getCommittedSource: () => undefined,
      getCommittedSelection: () => undefined,
    });
    const event = { url: new URL('https://example.test/a'), fetch };
    expect(() => load(event, { experience: { experienceId: '' } })).toThrow();
    expect(getOwner).not.toHaveBeenCalled();
    const source = await load(event, { experience: { experienceId: 'a' } });
    expect(getRequestSourceState(source).error?.message).toBe('startup');
    expect(fetch).not.toHaveBeenCalled();
  });
});

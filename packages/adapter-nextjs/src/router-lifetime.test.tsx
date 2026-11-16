import { EventBuilder } from '@contentful/experiences-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { NextjsRequestPresentation } from './router-lifetime.js';
import type { BoundNextjsExperiencesRootProps, NextjsRequestResult } from './request-result.js';

const initialPagePayload = { properties: { path: '/server' } };
const result: NextjsRequestResult = {
  requestId: 'initial',
  routeKey: '/page',
  experience: { experienceId: 'primary' },
  initialPagePayload,
  handoff: {
    spaceId: 'space',
    environmentId: 'master',
    cache: { scope: 'private-request' },
    replay: {
      routeKey: '/page',
      events: [
        new EventBuilder({
          channel: 'web',
          library: { name: 'test', version: '1.0.0' },
        }).buildTrack({ event: 'prepared' }),
      ],
    },
  },
};

describe('Next request presentation inputs', () => {
  it.each([
    'override',
    'configured',
    'server',
    'route',
    'not-ready',
    'empty',
    'nonpage',
    'empty-no-handoff',
    'departed',
    'web-route',
  ] as const)('presents %s page intent and preserves the supplied handoff', (source) => {
    const Root = vi.fn((_props: BoundNextjsExperiencesRootProps) => <></>);
    const configured = vi.fn(() => ({ properties: { path: '/configured' } }));
    const override = vi.fn(() => ({ properties: { path: '/override' } }));
    const buildRoutePayload = vi.fn(() => ({ properties: { path: '/route' } }));
    const explicit = ['empty', 'nonpage', 'empty-no-handoff', 'departed'].includes(source);
    const pageFree = explicit && source !== 'departed';
    const waiting = ['route', 'departed', 'not-ready'].includes(source);
    const routeKey = ['route', 'departed', 'web-route'].includes(source) ? '/destination' : '/page';
    const experience = explicit
      ? {
          ...result.experience,
          personalization: {
            events: source === 'nonpage' ? [{ type: 'track' as const, event: 'prepared' }] : [],
          },
        }
      : result.experience;
    renderToStaticMarkup(
      <NextjsRequestPresentation
        Root={Root}
        result={
          source === 'web-route'
            ? undefined
            : {
                ...result,
                experience,
                handoff: source === 'empty-no-handoff' ? undefined : result.handoff,
              }
        }
        routeKey={routeKey}
        ready={source !== 'not-ready'}
        configuredBuilder={['override', 'configured'].includes(source) ? configured : undefined}
        buildPagePayload={source === 'override' ? override : undefined}
        buildRoutePayload={buildRoutePayload}
        pageMode="analytics"
        beforeInitialPage={{ run: vi.fn() }}
      />
    );
    const captured = Root.mock.calls[0]![0];
    const expected = source === 'web-route' ? 'route' : source;
    expect(captured.buildPagePayload?.({ isInitialEmission: true })).toEqual(
      pageFree || waiting ? undefined : { properties: { path: `/${expected}` } }
    );
    expect(captured.buildPagePayload === undefined).toBe(pageFree || waiting);
    expect(captured.handoff).toBe(
      ['empty-no-handoff', 'departed', 'route', 'web-route'].includes(source)
        ? undefined
        : result.handoff
    );
    expect(captured.initialPagePayload).toBeUndefined();
    expect(captured.routeKey).toBe(routeKey);
    expect(captured.pageMode).toBe(pageFree || waiting ? undefined : 'analytics');
    expect(captured.beforeInitialPage === undefined).toBe(waiting);
    expect(configured).toHaveBeenCalledTimes(source === 'configured' ? 1 : 0);
    expect(override).toHaveBeenCalledTimes(source === 'override' ? 1 : 0);
    expect(buildRoutePayload).toHaveBeenCalledTimes(!waiting && expected === 'route' ? 1 : 0);
  });
  it('retains explicit root handoff and static page arguments without a request result', () => {
    const Root = vi.fn((_props: BoundNextjsExperiencesRootProps) => <></>);
    renderToStaticMarkup(
      <NextjsRequestPresentation
        Root={Root}
        routeKey="/explicit"
        handoff={result.handoff}
        initialPagePayload={initialPagePayload}
        buildRoutePayload={() => ({ properties: { path: '/route' } })}
      />
    );
    const captured = Root.mock.calls[0]![0];
    expect(captured.handoff).toBe(result.handoff);
    expect(captured.buildPagePayload?.({ isInitialEmission: true })).toEqual(initialPagePayload);
  });
});

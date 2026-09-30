import { describe, expect, it } from 'vitest';

import EventBuilder from './event-builder.js';
import {
  parseRuntimeEventHandoff,
  RUNTIME_EVENT_HANDOFF_VERSION,
  type RuntimeEventHandoff,
} from './runtime-event-handoff.js';

function createHandoff(): RuntimeEventHandoff {
  const builder = new EventBuilder({
    channel: 'server',
    library: { name: '@contentful/experiences-node', version: 'test' },
  });
  return {
    version: RUNTIME_EVENT_HANDOFF_VERSION,
    spaceId: 'space',
    environmentId: 'master',
    initialProfileId: 'profile-1',
    events: [
      { transport: 'personalization', event: builder.buildPageView() },
      {
        transport: 'analytics',
        event: builder.buildClick({ entityId: 'hero', entityKind: 'InlineComponent' }),
      },
    ],
    initialPageRouteKey: '/home',
  };
}

describe('parseRuntimeEventHandoff', () => {
  it('round-trips a valid serialized handoff', () => {
    const handoff = createHandoff();

    expect(parseRuntimeEventHandoff(JSON.parse(JSON.stringify(handoff)))).toEqual(handoff);
  });

  it('validates protocol version, page markers, and profile ordering', () => {
    const handoff = createHandoff();

    expect(() => parseRuntimeEventHandoff({ ...handoff, version: 2 })).toThrow();
    expect(() => parseRuntimeEventHandoff({ ...handoff, events: [handoff.events[1]] })).toThrow(
      'initial page requires a staged page event'
    );
    expect(() =>
      parseRuntimeEventHandoff({
        ...handoff,
        initialProfileId: undefined,
        initialPageRouteKey: undefined,
        events: [handoff.events[1]],
      })
    ).toThrow('Analytics events require');
  });

  it('rejects malformed events and handoffs beyond the private response cap', () => {
    const handoff = createHandoff();

    expect(() =>
      parseRuntimeEventHandoff({
        ...handoff,
        initialPageRouteKey: undefined,
        events: [{ transport: 'personalization', event: { type: 'page' } }],
      })
    ).toThrow();
    expect(() =>
      parseRuntimeEventHandoff({
        ...handoff,
        initialProfileId: 'x'.repeat(64 * 1024),
      })
    ).toThrow('serialized bytes');
  });
});

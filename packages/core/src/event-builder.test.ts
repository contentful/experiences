import { afterEach, describe, expect, it, vi } from 'vitest';

import EventBuilder, { DEFAULT_PAGE_PROPERTIES } from './event-builder';

import {
  ExoClickEvent,
  ExoHoverEvent,
  ExoViewEvent,
} from '@contentful/optimization-api-client/api-schemas';

const LIBRARY = { name: '@contentful/experiences-sdk-core', version: '0.8.4' };

function createBuilder() {
  return new EventBuilder({ channel: 'web', library: LIBRARY });
}

const interaction = {
  entityId: 'experience-1',
  entityKind: 'Experience' as const,
  optimizationId: 'optimization-1',
  variantId: 'variant-1',
  variantIndex: 1,
};

afterEach(() => {
  vi.useRealTimers();
});

describe('EventBuilder', () => {
  it('builds an API-compatible ExO view event', () => {
    const event = createBuilder().buildExoView({
      ...interaction,
      viewId: 'view-1',
      viewDurationMs: 1_000,
    });

    expect(ExoViewEvent.parse(event)).toEqual(event);
    expect(event).toMatchObject({
      ...interaction,
      type: 'exo_node_view',
      viewId: 'view-1',
      viewDurationMs: 1_000,
    });
  });

  it('builds API-compatible ExO click and hover events', () => {
    const builder = createBuilder();
    const click = builder.buildExoClick(interaction);
    const hover = builder.buildExoHover({
      ...interaction,
      hoverId: 'hover-1',
      hoverDurationMs: 500,
    });

    expect(ExoClickEvent.parse(click)).toEqual(click);
    expect(ExoHoverEvent.parse(hover)).toEqual(hover);
    expect(click.type).toBe('exo_node_click');
    expect(hover.type).toBe('exo_node_hover');
  });

  it('builds ExO events without optimization selection data', () => {
    const builder = createBuilder();
    const view = builder.buildExoView({
      entityId: 'experience-1',
      entityKind: 'Experience',
      viewId: 'view-1',
      viewDurationMs: 1_000,
    });
    const click = builder.buildExoClick({
      entityId: 'experience-1',
      entityKind: 'Experience',
    });
    const hover = builder.buildExoHover({
      entityId: 'experience-1',
      entityKind: 'Experience',
      hoverId: 'hover-1',
      hoverDurationMs: 500,
    });

    expect(ExoViewEvent.parse(view)).toEqual(view);
    expect(ExoClickEvent.parse(click)).toEqual(click);
    expect(ExoHoverEvent.parse(hover)).toEqual(hover);

    for (const event of [view, click, hover]) {
      expect(event).toMatchObject({
        entityId: 'experience-1',
        entityKind: 'Experience',
      });
      expect(event).not.toHaveProperty('optimizationId');
      expect(event).not.toHaveProperty('variantId');
      expect(event).not.toHaveProperty('variantIndex');
    }
  });

  it('uses configured context providers and infers campaign values', () => {
    const builder = new EventBuilder({
      channel: 'web',
      library: LIBRARY,
      getConsent: () => true,
      getLocale: () => 'de-DE',
      getPageProperties: () => ({
        ...DEFAULT_PAGE_PROPERTIES,
        url: 'https://example.com/?utm_campaign=launch&utm_source=newsletter',
      }),
      getUserAgent: () => 'test-agent',
    });

    const event = builder.buildExoClick(interaction);

    expect(event.context).toMatchObject({
      campaign: { name: 'launch', source: 'newsletter' },
      gdpr: { isConsentGiven: true },
      locale: 'de-DE',
      userAgent: 'test-agent',
    });
  });

  it('retains flag, identify, page, and track builders', () => {
    const builder = createBuilder();

    expect(builder.buildFlagView({ componentId: 'flag-1' })).toMatchObject({
      type: 'component',
      componentType: 'Variable',
      componentId: 'flag-1',
      variantIndex: 0,
    });
    expect(builder.buildIdentify({ userId: 'user-1' })).toMatchObject({
      type: 'identify',
      userId: 'user-1',
      traits: {},
    });
    expect(builder.buildPageView()).toMatchObject({
      type: 'page',
      properties: DEFAULT_PAGE_PROPERTIES,
    });
    expect(builder.buildTrack({ event: 'cta_clicked' })).toMatchObject({
      type: 'track',
      event: 'cta_clicked',
      properties: {},
    });
  });

  it('rejects invalid ExO interaction arguments', () => {
    expect(() =>
      createBuilder().buildExoView({
        ...interaction,
        viewId: 'view-1',
        viewDurationMs: -1,
      })
    ).toThrow();
  });
});

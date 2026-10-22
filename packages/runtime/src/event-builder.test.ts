import { afterEach, describe, expect, it, vi } from 'vitest';

import EventBuilder, {
  DEFAULT_PAGE_PROPERTIES,
  type InteractionBuilderArgsBase,
} from './event-builder';
import { DEFAULT_EVENT_CONTEXT_LIBRARY } from './sdk-info';

const LIBRARY = { name: '@contentful/experiences-sdk-core', version: '0.8.4' };

function createBuilder() {
  return new EventBuilder({ channel: 'web', library: LIBRARY });
}

function buildInteractionEvents(args: InteractionBuilderArgsBase) {
  const builder = createBuilder();
  return [
    builder.buildView({ ...args, viewId: 'view-1', viewDurationMs: 1_000 }),
    builder.buildClick(args),
    builder.buildHover({ ...args, hoverId: 'hover-1', hoverDurationMs: 500 }),
  ] as const;
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
  it('uses an unbundled default event context library', () => {
    expect(DEFAULT_EVENT_CONTEXT_LIBRARY).toEqual({
      name: '@contentful/experiences-runtime',
      version: '0.0.0',
    });
  });

  it('maps ExO interaction properties and event types', () => {
    const events = buildInteractionEvents(interaction);
    const [view, click, hover] = events;

    expect(view).toMatchObject({
      ...interaction,
      type: 'exo_node_view',
      viewId: 'view-1',
      viewDurationMs: 1_000,
    });
    expect(click.type).toBe('exo_node_click');
    expect(hover.type).toBe('exo_node_hover');
    expect(() =>
      createBuilder().buildView({ ...interaction, viewId: 'view-1', viewDurationMs: -1 })
    ).toThrow();
  });

  it('builds baseline Experience events with a default variant and no parent variant', () => {
    const events = buildInteractionEvents({ entityId: 'experience-1', entityKind: 'Experience' });

    for (const event of events) {
      expect(event).toMatchObject({
        entityId: 'experience-1',
        entityKind: 'Experience',
        variantId: 'default',
      });
      expect(event).not.toHaveProperty('optimizationId');
      expect(event).not.toHaveProperty('variantIndex');
      expect(event).not.toHaveProperty('parentVariantId');
    }
  });

  it('builds baseline Fragment events with default own and parent variants', () => {
    const events = buildInteractionEvents({
      entityId: 'fragment-1',
      entityKind: 'ExperienceFragment',
    });

    for (const event of events) {
      expect(event).toMatchObject({
        entityId: 'fragment-1',
        entityKind: 'ExperienceFragment',
        variantId: 'default',
        parentVariantId: 'default',
      });
      expect(event).not.toHaveProperty('optimizationId');
      expect(event).not.toHaveProperty('variantIndex');
    }
  });

  it.each([
    [undefined, 'default'],
    ['', 'default'],
    ['root-variant', 'root-variant'],
  ])(
    'retains the root Experience variant %s on all interaction events',
    (parentVariantId, expectedParentVariantId) => {
      const events = buildInteractionEvents({
        ...interaction,
        entityId: 'fragment-1',
        entityKind: 'ExperienceFragment' as const,
        parentExperienceId: 'experience-1',
        parentVariantId,
      });

      for (const event of events) {
        expect(event).toMatchObject({
          entityId: 'fragment-1',
          variantId: 'variant-1',
          parentExperienceId: 'experience-1',
          parentVariantId: expectedParentVariantId,
        });
      }
    }
  );

  it.each(['Experience', 'ExperienceFragment'] as const)(
    'defaults an empty own variant on %s events',
    (entityKind) => {
      const events = buildInteractionEvents({ entityId: 'entity-1', entityKind, variantId: '' });
      for (const event of events) expect(event).toHaveProperty('variantId', 'default');
    }
  );

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

    const event = builder.buildClick(interaction);

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
});

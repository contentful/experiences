/* eslint-disable no-redeclare */

import {
  type App,
  Campaign,
  type Channel,
  ExoClickEvent,
  ExoEntityKind,
  ExoEventProperties,
  ExoHoverEvent,
  ExoViewEvent,
  GeoLocation,
  type IdentifyEvent,
  type Library,
  Page,
  PageEventContext,
  type PageViewEvent,
  parseWithFriendlyError,
  Properties,
  Screen,
  type TrackEvent,
  Traits,
  UniversalEventProperties,
  type ViewEvent,
} from '@contentful/optimization-api-client/api-schemas';
import { createScopedLogger } from '@contentful/optimization-api-client/logger';
import { merge } from 'es-toolkit/object';
import * as z from 'zod/mini';

export { ExoClickEvent, ExoEntityKind, ExoEventProperties, ExoHoverEvent, ExoViewEvent };

const eventBuilderLogger = createScopedLogger('Experiences:EventBuilder');

const UTM_CAMPAIGN_PARAMETERS = [
  ['utm_campaign', 'name'],
  ['utm_source', 'source'],
  ['utm_medium', 'medium'],
  ['utm_term', 'term'],
  ['utm_content', 'content'],
] as const;

function extractCampaignFromUrl(url: string | undefined): Campaign | undefined {
  if (url === undefined) return undefined;

  try {
    const { searchParams } = new URL(url);
    const campaign: Campaign = {};
    let hasCampaignParameter = false;

    for (const [parameter, property] of UTM_CAMPAIGN_PARAMETERS) {
      if (!searchParams.has(parameter)) continue;

      campaign[property] = searchParams.get(parameter) ?? '';
      hasCampaignParameter = true;
    }

    return hasCampaignParameter ? campaign : undefined;
  } catch {
    return undefined;
  }
}

export interface EventBuilderConfig {
  app?: App;
  channel: Channel;
  library: Library;
  getLocale?: () => string | undefined;
  getPageProperties?: () => Page;
  getUserAgent?: () => string | undefined;
  getConsent?: () => boolean | undefined;
}

export const UniversalEventBuilderArgs = z.object({
  campaign: z.optional(Campaign),
  locale: z.optional(z.string()),
  location: z.optional(GeoLocation),
  page: z.optional(Page),
  screen: z.optional(Screen),
  userAgent: z.optional(z.string()),
});

export type UniversalEventBuilderArgs = z.infer<typeof UniversalEventBuilderArgs>;

export const ExoInteractionBuilderArgsBase = z.extend(UniversalEventBuilderArgs, {
  entityId: z.string(),
  entityKind: ExoEntityKind,
  entityKindId: z.optional(z.string()),
  entryIds: z.optional(z.array(z.string())),
  optimizationId: z.string(),
  parameters: z.optional(z.record(z.string(), z.json())),
  parentExperienceId: z.optional(z.string()),
  variantId: z.string(),
  variantIndex: z.optional(z.number()),
});

export type ExoInteractionBuilderArgsBase = z.infer<typeof ExoInteractionBuilderArgsBase>;

export const ExoViewBuilderArgs = z.extend(ExoInteractionBuilderArgsBase, {
  viewId: z.string(),
  viewDurationMs: z.int().check(z.minimum(0)),
});

export type ExoViewBuilderArgs = z.infer<typeof ExoViewBuilderArgs>;

export const ExoClickBuilderArgs = ExoInteractionBuilderArgsBase;

export type ExoClickBuilderArgs = z.infer<typeof ExoClickBuilderArgs>;

export const ExoHoverBuilderArgs = z.extend(ExoInteractionBuilderArgsBase, {
  hoverId: z.string(),
  hoverDurationMs: z.int().check(z.minimum(0)),
});

export type ExoHoverBuilderArgs = z.infer<typeof ExoHoverBuilderArgs>;

const FlagInteractionBuilderArgsBase = z.extend(UniversalEventBuilderArgs, {
  componentId: z.string(),
  experienceId: z.optional(z.string()),
  variantIndex: z.optional(z.number()),
});

export const FlagViewBuilderArgs = z.extend(FlagInteractionBuilderArgsBase, {
  viewId: z.optional(z.string()),
  viewDurationMs: z.optional(z.number()),
});

export type FlagViewBuilderArgs = z.infer<typeof FlagViewBuilderArgs>;

export const IdentifyBuilderArgs = z.extend(UniversalEventBuilderArgs, {
  traits: z.optional(Traits),
  userId: z.string(),
});

export type IdentifyBuilderArgs = z.infer<typeof IdentifyBuilderArgs>;

export const PageViewBuilderArgs = z.extend(UniversalEventBuilderArgs, {
  properties: z.optional(z.partial(Page)),
});

export type PageViewBuilderArgs = z.infer<typeof PageViewBuilderArgs>;

export const TrackBuilderArgs = z.extend(UniversalEventBuilderArgs, {
  event: z.string(),
  properties: z.optional(z.prefault(Properties, {})),
});

export type TrackBuilderArgs = z.infer<typeof TrackBuilderArgs>;

const PAGE_CONTEXT_CONFLICT_KEYS = ['path', 'query', 'search', 'url'] as const;

function warnIfPageContextConflicts(explicitPage: Page | undefined, properties: Page): void {
  if (!explicitPage) return;

  const conflictingKeys = PAGE_CONTEXT_CONFLICT_KEYS.filter((key) => {
    const { [key]: explicitValue } = explicitPage;
    const { [key]: propertyValue } = properties;
    return JSON.stringify(explicitValue) !== JSON.stringify(propertyValue);
  });

  if (conflictingKeys.length === 0) return;

  eventBuilderLogger.warn(
    `Explicit page context differs from page event properties for: ${conflictingKeys.join(', ')}`
  );
}

export const DEFAULT_PAGE_PROPERTIES: Page = {
  path: '',
  query: {},
  referrer: '',
  search: '',
  title: '',
  url: '',
};

class EventBuilder {
  app?: App;
  channel: Channel;
  library: Library;
  getLocale: () => string | undefined;
  getPageProperties: () => Page;
  getUserAgent: () => string | undefined;
  getConsent: () => boolean | undefined;

  constructor(config: EventBuilderConfig) {
    const { app, channel, library, getLocale, getPageProperties, getUserAgent, getConsent } =
      config;
    this.app = app;
    this.channel = channel;
    this.library = library;
    this.getLocale = getLocale ?? (() => 'en-US');
    this.getPageProperties = getPageProperties ?? (() => DEFAULT_PAGE_PROPERTIES);
    this.getUserAgent = getUserAgent ?? (() => undefined);
    this.getConsent = getConsent ?? (() => undefined);
  }

  protected buildUniversalEventProperties({
    campaign,
    locale,
    location,
    page,
    screen,
    userAgent,
  }: UniversalEventBuilderArgs): UniversalEventProperties {
    const timestamp = new Date().toISOString();
    const resolvedPage = page ?? this.getPageProperties();

    return {
      channel: this.channel,
      context: {
        app: this.app,
        campaign: campaign ?? extractCampaignFromUrl(resolvedPage.url) ?? {},
        gdpr: { isConsentGiven: this.getConsent() === true },
        library: this.library,
        locale: locale ?? this.getLocale() ?? 'en-US',
        location,
        page: resolvedPage,
        screen,
        userAgent: userAgent ?? this.getUserAgent(),
      },
      messageId: crypto.randomUUID(),
      originalTimestamp: timestamp,
      sentAt: timestamp,
      timestamp,
    };
  }

  private buildExoInteractionBase(
    args: ExoInteractionBuilderArgsBase
  ): UniversalEventProperties & ExoInteractionBuilderArgsBase {
    const { campaign, locale, location, page, screen, userAgent, ...exoProperties } = args;

    return {
      ...this.buildUniversalEventProperties({
        campaign,
        locale,
        location,
        page,
        screen,
        userAgent,
      }),
      ...exoProperties,
    };
  }

  buildExoView(args: ExoViewBuilderArgs): ExoViewEvent {
    const { viewId, viewDurationMs, ...interaction } = parseWithFriendlyError(
      ExoViewBuilderArgs,
      args
    );

    return {
      ...this.buildExoInteractionBase(interaction),
      type: 'exo_node_view',
      viewId,
      viewDurationMs,
    };
  }

  buildExoClick(args: ExoClickBuilderArgs): ExoClickEvent {
    const interaction = parseWithFriendlyError(ExoClickBuilderArgs, args);

    return {
      ...this.buildExoInteractionBase(interaction),
      type: 'exo_node_click',
    };
  }

  buildExoHover(args: ExoHoverBuilderArgs): ExoHoverEvent {
    const { hoverId, hoverDurationMs, ...interaction } = parseWithFriendlyError(
      ExoHoverBuilderArgs,
      args
    );

    return {
      ...this.buildExoInteractionBase(interaction),
      type: 'exo_node_hover',
      hoverId,
      hoverDurationMs,
    };
  }

  buildFlagView(args: FlagViewBuilderArgs): ViewEvent {
    const { componentId, experienceId, variantIndex, viewId, viewDurationMs, ...universal } =
      parseWithFriendlyError(FlagViewBuilderArgs, args);

    return {
      ...this.buildUniversalEventProperties(universal),
      ...(viewDurationMs === undefined ? {} : { viewDurationMs }),
      ...(viewId === undefined ? {} : { viewId }),
      type: 'component',
      componentType: 'Variable',
      componentId,
      experienceId,
      variantIndex: variantIndex ?? 0,
    };
  }

  buildIdentify(args: IdentifyBuilderArgs): IdentifyEvent {
    const { traits = {}, userId, ...universal } = parseWithFriendlyError(IdentifyBuilderArgs, args);

    return {
      ...this.buildUniversalEventProperties(universal),
      type: 'identify',
      traits,
      userId,
    };
  }

  buildPageView(args: PageViewBuilderArgs = {}): PageViewEvent {
    const { properties = {}, ...universal } = parseWithFriendlyError(PageViewBuilderArgs, args);
    const propertiesCampaign = extractCampaignFromUrl(properties.url);
    const pageProperties = this.getPageProperties();
    const merged = merge(
      {
        ...pageProperties,
        title: pageProperties.title ?? DEFAULT_PAGE_PROPERTIES.title,
      },
      properties
    );

    warnIfPageContextConflicts(universal.page, merged);

    const {
      context: { screen: _, ...universalContext },
      ...universalProperties
    } = this.buildUniversalEventProperties({
      ...universal,
      campaign: universal.campaign ?? propertiesCampaign,
      page: universal.page ?? merged,
    });

    const context = parseWithFriendlyError(PageEventContext, universalContext);

    return {
      ...universalProperties,
      context,
      type: 'page',
      properties: merged,
    };
  }

  buildTrack(args: TrackBuilderArgs): TrackEvent {
    const { event, properties = {}, ...universal } = parseWithFriendlyError(TrackBuilderArgs, args);

    return {
      ...this.buildUniversalEventProperties(universal),
      type: 'track',
      event,
      properties,
    };
  }
}

export default EventBuilder;

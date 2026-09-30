/* eslint-disable no-redeclare */

import {
  type App as OptimizationApp,
  Campaign as OptimizationCampaign,
  type Channel as OptimizationChannel,
  type ExoClickEvent as OptimizationExoClickEvent,
  ExoEntityKind as OptimizationExoEntityKind,
  type ExoHoverEvent as OptimizationExoHoverEvent,
  type ExoViewEvent as OptimizationExoViewEvent,
  GeoLocation as OptimizationGeoLocation,
  type IdentifyEvent as OptimizationIdentifyEvent,
  type Library as OptimizationLibrary,
  Page as OptimizationPage,
  PageEventContext as OptimizationPageEventContext,
  type PageViewEvent as OptimizationPageViewEvent,
  parseWithFriendlyError as parseOptimizationSchema,
  Properties as OptimizationProperties,
  Screen as OptimizationScreen,
  type TrackEvent as OptimizationTrackEvent,
  Traits as OptimizationTraits,
  UniversalEventProperties as OptimizationUniversalEventProperties,
  type ViewEvent as OptimizationViewEvent,
} from '@contentful/optimization-api-client/api-schemas';
import { createScopedLogger as createOptimizationScopedLogger } from '@contentful/optimization-api-client/logger';
import { merge } from 'es-toolkit/object';
import * as z from 'zod/mini';

const eventBuilderLogger = createOptimizationScopedLogger('Experiences:EventBuilder');

const UTM_CAMPAIGN_PARAMETERS = [
  ['utm_campaign', 'name'],
  ['utm_source', 'source'],
  ['utm_medium', 'medium'],
  ['utm_term', 'term'],
  ['utm_content', 'content'],
] as const;

function extractCampaignFromUrl(url: string | undefined): OptimizationCampaign | undefined {
  if (url === undefined) return undefined;

  try {
    const { searchParams } = new URL(url);
    const campaign: OptimizationCampaign = {};
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
  app?: OptimizationApp;
  channel: OptimizationChannel;
  library: OptimizationLibrary;
  getLocale?: () => string | undefined;
  getPageProperties?: () => OptimizationPage;
  getUserAgent?: () => string | undefined;
  getConsent?: () => boolean | undefined;
}

export const UniversalEventBuilderArgs = z.object({
  campaign: z.optional(OptimizationCampaign),
  locale: z.optional(z.string()),
  location: z.optional(OptimizationGeoLocation),
  page: z.optional(OptimizationPage),
  screen: z.optional(OptimizationScreen),
  userAgent: z.optional(z.string()),
});

export type UniversalEventBuilderArgs = z.infer<typeof UniversalEventBuilderArgs>;

export const InteractionBuilderArgsBase = z.extend(UniversalEventBuilderArgs, {
  entityId: z.string(),
  entityKind: OptimizationExoEntityKind,
  entityKindId: z.optional(z.string()),
  entryIds: z.optional(z.array(z.string())),
  optimizationId: z.optional(z.string()),
  parameters: z.optional(z.record(z.string(), z.json())),
  parentExperienceId: z.optional(z.string()),
  variantId: z.optional(z.string()),
  variantIndex: z.optional(z.number()),
});

export type InteractionBuilderArgsBase = z.infer<typeof InteractionBuilderArgsBase>;

export const ViewBuilderArgs = z.extend(InteractionBuilderArgsBase, {
  viewId: z.string(),
  viewDurationMs: z.int().check(z.minimum(0)),
});

export type ViewBuilderArgs = z.infer<typeof ViewBuilderArgs>;

export const ClickBuilderArgs = InteractionBuilderArgsBase;

export type ClickBuilderArgs = z.infer<typeof ClickBuilderArgs>;

export const HoverBuilderArgs = z.extend(InteractionBuilderArgsBase, {
  hoverId: z.string(),
  hoverDurationMs: z.int().check(z.minimum(0)),
});

export type HoverBuilderArgs = z.infer<typeof HoverBuilderArgs>;

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
  traits: z.optional(OptimizationTraits),
  userId: z.string(),
});

export type IdentifyBuilderArgs = z.infer<typeof IdentifyBuilderArgs>;

export const PageViewBuilderArgs = z.extend(UniversalEventBuilderArgs, {
  properties: z.optional(z.partial(OptimizationPage)),
});

export type PageViewBuilderArgs = z.infer<typeof PageViewBuilderArgs>;

export const TrackBuilderArgs = z.extend(UniversalEventBuilderArgs, {
  event: z.string(),
  properties: z.optional(z.prefault(OptimizationProperties, {})),
});

export type TrackBuilderArgs = z.infer<typeof TrackBuilderArgs>;

const PAGE_CONTEXT_CONFLICT_KEYS = ['path', 'query', 'search', 'url'] as const;

function warnIfPageContextConflicts(
  explicitPage: OptimizationPage | undefined,
  properties: OptimizationPage
): void {
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

export const DEFAULT_PAGE_PROPERTIES: OptimizationPage = {
  path: '',
  query: {},
  referrer: '',
  search: '',
  title: '',
  url: '',
};

class EventBuilder {
  app?: OptimizationApp;
  channel: OptimizationChannel;
  library: OptimizationLibrary;
  getLocale: () => string | undefined;
  getPageProperties: () => OptimizationPage;
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
  }: UniversalEventBuilderArgs): OptimizationUniversalEventProperties {
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

  private buildInteractionBase(
    args: InteractionBuilderArgsBase
  ): OptimizationUniversalEventProperties & InteractionBuilderArgsBase {
    const { campaign, locale, location, page, screen, userAgent, ...interactionProperties } = args;

    return {
      ...this.buildUniversalEventProperties({
        campaign,
        locale,
        location,
        page,
        screen,
        userAgent,
      }),
      ...interactionProperties,
    };
  }

  buildView(args: ViewBuilderArgs): OptimizationExoViewEvent {
    const { viewId, viewDurationMs, ...interaction } = parseOptimizationSchema(
      ViewBuilderArgs,
      args
    );

    return {
      ...this.buildInteractionBase(interaction),
      type: 'exo_node_view',
      viewId,
      viewDurationMs,
    };
  }

  buildClick(args: ClickBuilderArgs): OptimizationExoClickEvent {
    const interaction = parseOptimizationSchema(ClickBuilderArgs, args);

    return {
      ...this.buildInteractionBase(interaction),
      type: 'exo_node_click',
    };
  }

  buildHover(args: HoverBuilderArgs): OptimizationExoHoverEvent {
    const { hoverId, hoverDurationMs, ...interaction } = parseOptimizationSchema(
      HoverBuilderArgs,
      args
    );

    return {
      ...this.buildInteractionBase(interaction),
      type: 'exo_node_hover',
      hoverId,
      hoverDurationMs,
    };
  }

  buildFlagView(args: FlagViewBuilderArgs): OptimizationViewEvent {
    const { componentId, experienceId, variantIndex, viewId, viewDurationMs, ...universal } =
      parseOptimizationSchema(FlagViewBuilderArgs, args);

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

  buildIdentify(args: IdentifyBuilderArgs): OptimizationIdentifyEvent {
    const {
      traits = {},
      userId,
      ...universal
    } = parseOptimizationSchema(IdentifyBuilderArgs, args);

    return {
      ...this.buildUniversalEventProperties(universal),
      type: 'identify',
      traits,
      userId,
    };
  }

  buildPageView(args: PageViewBuilderArgs = {}): OptimizationPageViewEvent {
    const { properties = {}, ...universal } = parseOptimizationSchema(PageViewBuilderArgs, args);
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

    const context = parseOptimizationSchema(OptimizationPageEventContext, universalContext);

    return {
      ...universalProperties,
      context,
      type: 'page',
      properties: merged,
    };
  }

  buildTrack(args: TrackBuilderArgs): OptimizationTrackEvent {
    const {
      event,
      properties = {},
      ...universal
    } = parseOptimizationSchema(TrackBuilderArgs, args);

    return {
      ...this.buildUniversalEventProperties(universal),
      type: 'track',
      event,
      properties,
    };
  }
}

export default EventBuilder;

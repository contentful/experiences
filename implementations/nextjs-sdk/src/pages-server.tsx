import {
  bindNextjsPagesRouterServerExperiences,
  type NextjsRequestResult,
} from '@contentful/experiences-nextjs/pages-router/server';
import {
  createNextjsPageContext,
  createNextjsRouteKey,
  serializeNextjsJsonForHtml,
} from '@contentful/experiences-nextjs/server';
import type { GetServerSideProps } from 'next';
import { randomUUID } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';
import { getServer } from './config';
import {
  readConsent,
  contentSeeds,
  serverPreview,
  loadComparisons,
  type ServerContent,
} from './server-reference';
import { routeIds, type BrowserEnvironment, type ContentSeed } from './reference';
import { experienceConfig } from './components/ExperienceContent';
import { ServerPresentations } from './components/ServerPresentations';

export type PagesReferenceProps = {
  environment: BrowserEnvironment;
  serverOnly: boolean;
  analytics: boolean;
  experiences: NextjsRequestResult;
  html?: string;
  comparisons?: ContentSeed[];
};

export const getReferenceServerSideProps: GetServerSideProps<PagesReferenceProps> = async (
  context
) => {
  const { nodeConfig, config, browser } = getServer();
  let url = new URL(context.resolvedUrl, config.origin);
  const serverOnly = url.searchParams.get('mode') === 'server-only';
  // Native href/as navigation sends content intent in query while retaining the
  // original visible page. These reference-only inputs never become page intent.
  const action =
    serverOnly &&
    typeof context.query.action === 'string' &&
    ['retry', 'identify', 'track'].includes(context.query.action) &&
    typeof context.query.actionRouteKey === 'string'
      ? context.query.action
      : undefined;
  if (action) {
    const routeKey = context.query.actionRouteKey as string;
    const visible = new URL(routeKey, config.origin);
    if (
      !routeKey.startsWith('/') ||
      routeKey.startsWith('//') ||
      visible.origin !== config.origin ||
      visible.pathname !== url.pathname ||
      visible.hash ||
      visible.searchParams.get('mode') !== 'server-only'
    )
      throw new Error('Unknown reference content action route.');
    url = visible;
  }
  const analytics = url.searchParams.get('analytics') !== 'off';
  const page = createNextjsPageContext({
    path: url.pathname,
    origin: config.origin,
    searchParams: url.searchParams,
    referrer: context.req.headers.referer ?? '',
  });
  const identify = { type: 'identify' as const, userId: 'charles', traits: { identified: true } };
  const events =
    action === 'identify'
      ? [identify]
      : action === 'track'
        ? [{ type: 'track' as const, event: 'reference_custom_action' }]
        : [];
  const preview = Boolean(serverPreview(url));
  let comparisons: ServerContent[] = [];
  const experience = {
    experienceId:
      (preview &&
        (url.searchParams.get('preview_experience_id')?.trim() ||
          browser.livePreview?.experienceId)) ||
      routeIds(url.pathname, config.experienceIds)[0],
    ...(preview ? {} : { extensions: { sourceMap: {} } }),
  };
  if (!serverOnly && context.req.headers['x-nextjs-data'] === '1' && !livePreview) {
    context.res.setHeader('Cache-Control', 'private, no-store');
    return {
      props: {
        environment: browser,
        serverOnly,
        analytics,
        comparisons: [],
        experiences: {
          requestId: randomUUID(),
          routeKey: createNextjsRouteKey(url),
          experience,
        },
      },
    };
  }
  let html: string | undefined;
  const experiences = await bindNextjsPagesRouterServerExperiences({
    ...nodeConfig,
    config: experienceConfig,
    origin: config.origin,
    browser: {
      delivery: browser.web.delivery,
      ...(browser.web.preview ? { preview: browser.web.preview } : {}),
    },
    request: {
      ...(action
        ? {}
        : {
            pagePayload: { properties: page },
            initialEvents:
              context.req.headers['x-nextjs-data'] !== '1' &&
              url.searchParams.get('userId') === 'charles'
                ? [identify]
                : [],
          }),
      experience: {
        ...experience,
        ...(action && !preview ? { personalization: { events } } : {}),
      },

      composeRequest: async (request, primary) => {
        comparisons = await loadComparisons(request, primary, url);
        if (serverOnly)
          html = renderToStaticMarkup(
            <ServerPresentations
              all={[primary, ...comparisons]}
              routeKey={createNextjsRouteKey(url)}
              ids={config.experienceIds}
              title={
                analytics ? undefined : url.pathname.endsWith('/page-two') ? 'Page Two' : 'Next SDK'
              }
            />
          );
      },
    },
    consent: { server: ({ cookies }) => readConsent(cookies) },
    livePreview: {
      ...browser.livePreview,
      enabled: Boolean(browser.livePreview),
      loadImplementation: () => import('@contentful/experiences-live-preview'),
    },
    cookie: { secure: url.protocol === 'https:' },
  }).request.loadExperience(context, { routeKey: createNextjsRouteKey(url) });
  const props: PagesReferenceProps = { environment: browser, serverOnly, analytics, experiences };
  if (serverOnly) {
    const opaque = { ...experiences };
    delete opaque.plan;
    props.experiences = opaque;
    if (html !== undefined) props.html = html;
  } else {
    props.comparisons = contentSeeds(comparisons, experiences);
  }
  return { props: JSON.parse(serializeNextjsJsonForHtml(props)) as PagesReferenceProps };
};

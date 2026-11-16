import {
  bindPagesRouterServerExperiences,
  type RequestResult,
} from '@contentful/experiences-nextjs/pages-router/server';
import {
  createPageContext,
  createRouteKey,
  serializeJsonForHtml,
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
import {
  primaryExperience,
  routeIds,
  type BrowserEnvironment,
  type ContentSeed,
} from './reference';
import { experienceConfig } from './components/ExperienceContent';
import { ServerPresentations } from './components/ServerPresentations';

export type PagesReferenceProps = {
  environment: BrowserEnvironment;
  serverOnly: boolean;
  analytics: boolean;
  experiences: RequestResult;
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
  const page = createPageContext({
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
  const experience = primaryExperience(
    browser,
    url,
    routeIds(url.pathname, config.experienceIds)[0]
  );
  if (!serverOnly && context.req.headers['x-nextjs-data'] === '1' && !preview) {
    context.res.setHeader('Cache-Control', 'private, no-store');
    return {
      props: {
        environment: browser,
        serverOnly,
        analytics,
        comparisons: [],
        experiences: {
          requestId: randomUUID(),
          routeKey: createRouteKey(url),
          experience,
        },
      },
    };
  }
  let html: string | undefined;
  const experiences = await bindPagesRouterServerExperiences({
    ...nodeConfig,
    config: experienceConfig,
    origin: config.origin,
    browser: {
      delivery: browser.web.delivery,
      ...(browser.web.preview ? { preview: browser.web.preview } : {}),
    },
    request: {
      mode: serverOnly ? 'ssr' : 'hybrid',
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

      composeRequest: async (request, { plan, error }) => {
        const primary = { experienceId: experience.experienceId, plan, error };
        comparisons = await loadComparisons(request, primary, url, !serverOnly);
        if (serverOnly)
          html = renderToStaticMarkup(
            <ServerPresentations
              all={[primary, ...comparisons]}
              routeKey={createRouteKey(url)}
              ids={config.experienceIds}
              title={
                analytics ? undefined : url.pathname.endsWith('/page-two') ? 'Page Two' : 'Next SDK'
              }
            />
          );
      },
    },
    consent: { server: ({ cookies }) => readConsent(cookies) },
    cookie: { secure: url.protocol === 'https:' },
  }).request.loadExperience(context, { routeKey: createRouteKey(url) });
  const props: PagesReferenceProps = { environment: browser, serverOnly, analytics, experiences };
  if (serverOnly) {
    const opaque = { ...experiences };
    delete opaque.plan;
    props.experiences = opaque;
    if (html !== undefined) props.html = html;
  } else {
    props.comparisons = contentSeeds(comparisons, experiences);
  }
  return { props: JSON.parse(serializeJsonForHtml(props)) as PagesReferenceProps };
};

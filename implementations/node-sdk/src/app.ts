import {
  ContentfulExperiences,
  EXPERIENCES_NODE_SDK_VERSION,
  isDestinationRedirect,
  NotFoundError,
  type PortableRenderPlan,
} from '@contentful/experiences-node';
import { documentToHtmlString } from '@contentful/rich-text-html-renderer';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath, URL, URLSearchParams } from 'node:url';
import { parseEnv } from 'node:util';

// Read the local flag on each launch; PM2 can retain an older inherited value.
const previewEnabled =
  parseEnv(readFileSync(new URL('../.env', import.meta.url), 'utf8')).LIVE_PREVIEW_ENABLED ===
  'true';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name} in the implementation-local .env file.`);
  return value;
}

const port = Number(process.env.PORT ?? 3100);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}
const locale = process.env.LOCALE ?? 'en-US';
const defaultExperienceIds = [
  '3fLAdFb3BYAuImRhcW8k4t',
  '4WzbgzPQHa9Tr2ffbOU8p7',
  '7u2eP09B4BIBToH8UwSHck',
];
const experienceIds = (process.env.EXPERIENCE_IDS?.trim() || defaultExperienceIds.join(','))
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);
if (experienceIds.length === 0)
  throw new Error('EXPERIENCE_IDS override must contain an Experience ID.');

// Optional Destination demonstration. Destinations are space-scoped: no environment,
// locale, parameters or extensions. Without DESTINATION_ID the route explains the gap.
const destination = {
  id: process.env.DESTINATION_ID?.trim() || undefined,
  path: process.env.DESTINATION_PATH?.trim() || '/coded',
  nodeId: process.env.DESTINATION_NODE_ID?.trim() || 'sdk-ci-personalized',
  redirectPath: process.env.DESTINATION_REDIRECT_PATH?.trim() || '/legacy',
  missingPath: process.env.DESTINATION_MISSING_PATH?.trim() || '/missing',
};
// The app route that renders one Destination path; other query intent is retained.
function destinationHref(path: string, query = new URLSearchParams()): string {
  const search = new URLSearchParams(query);
  search.set('path', path);
  return `/destination?${search}`;
}

const sdk = new ContentfulExperiences({
  spaceId: required('SPACE_ID'),
  environmentId: required('ENVIRONMENT_ID'),
  delivery: { accessToken: required('CDA_TOKEN') },
  ...(previewEnabled
    ? {
        preview: {
          accessToken: required('PREVIEW_TOKEN'),
          host: process.env.PREVIEW_HOST?.trim() || undefined,
        },
      }
    : {}),
  locale,
});

const app = express();
app.set('view engine', 'ejs');
app.set('views', fileURLToPath(new URL('.', import.meta.url)));
app.locals.documentToHtmlString = documentToHtmlString;
app.locals.destinationLinks = destination.id
  ? [
      { label: 'By path', href: destinationHref(destination.path) },
      { label: 'Redirect', href: destinationHref(destination.redirectPath) },
      { label: 'Missing', href: destinationHref(destination.missingPath) },
    ]
  : [];
app.get('/health', (_request, response) => response.type('text/plain').send('ok'));
app.use((_request, response, next) => {
  response.set('Cache-Control', 'private, no-store');
  next();
});
app.use(rateLimit({ windowMs: 30_000, max: 1000 }));

function requestIntent(req: Request) {
  const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : undefined;
  const url = new URL(req.originalUrl, `${req.protocol}://${req.get('host')}`);
  const page = {
    path: req.path,
    query: Object.fromEntries(url.searchParams),
    referrer: req.get('referer') ?? '',
    search: url.search,
    url: url.href,
  };
  const eventContext = {
    locale,
    page,
    userAgent: req.get('user-agent') ?? 'node-js-server',
  };
  return { userId, url, page, eventContext };
}

app.get('/', async (req, res) => {
  const { userId, url, page, eventContext } = requestIntent(req);
  const sessionId = url.searchParams.get('preview_session_id')?.trim();
  const preview =
    previewEnabled && sessionId
      ? {
          sessionId,
          resourceResolution: process.env.LIVE_PREVIEW_RESOURCE_RESOLUTION?.trim() || undefined,
        }
      : undefined;
  const request = sdk.forRequest({
    consent: true,
    locale,
    eventContext,
    preview,
  });
  try {
    const identifyRequested = !request.isPreview && Boolean(userId);
    let events = request.isPreview
      ? undefined
      : [
          ...(identifyRequested && userId
            ? [{ type: 'identify' as const, userId, traits: { identified: true } }]
            : []),
          { type: 'page' as const, properties: page },
        ];
    const resolveOptions = { config: { components: {}, experienceTemplates: {} } };
    const plans = new Map<string, PortableRenderPlan>();
    // Evaluate initial intent once; later IDs are best-effort rendering comparisons.
    let profileId = request.profile?.id;
    let contentError: unknown;
    for (const experienceId of new Set(experienceIds)) {
      const options = {
        experienceId,
        ...(!request.isPreview
          ? { personalization: { ...(events ? { events } : {}), profileId } }
          : {}),
      };
      events = undefined;
      try {
        const plan = await request.fetchExperience(options, resolveOptions);
        profileId = plan.personalization?.profile.id ?? profileId;
        plans.set(experienceId, plan);
      } catch (error) {
        if (request.isPreview) throw error;
        contentError ??= error;
      }
    }
    if (!plans.size) res.status(contentError instanceof NotFoundError ? 404 : 502);
    const experiences = experienceIds.map((id) => ({ id, plan: plans.get(id) }));

    res.render('index', {
      isPreview: request.isPreview,
      identifyRequested,
      identifyHref: '/?userId=charles',
      experiences,
    });
  } finally {
    request.destroy();
  }
});

app.get('/destination', async (req, res) => {
  const { userId, url, page, eventContext } = requestIntent(req);
  const identifyRequested = Boolean(userId);
  const identify = new URLSearchParams(url.searchParams);
  identify.set('userId', 'charles');
  const view = {
    isPreview: false,
    identifyRequested,
    identifyHref: `/destination?${identify}`,
    experiences: [] as unknown[],
  };
  const destinationId = destination.id;
  if (!destinationId) {
    res.render('index', { ...view, destination: { configured: false } });
    return;
  }
  const requested = url.searchParams.get('path')?.trim();
  const path = !requested
    ? destination.path
    : requested.startsWith('/')
      ? requested
      : `/${requested}`;
  // Destinations have no native preview, so this route never configures a session.
  const request = sdk.forRequest({ consent: true, locale, eventContext });
  try {
    const resolveOptions = { config: { components: {}, experienceTemplates: {} } };
    // The by-path primary carries this page's intent once, like the first by-ID fetch.
    // A missing path rejects with NotFoundError, which the error handler maps to 404.
    const primary = await request.fetchByDestinationPath(
      {
        destinationId,
        path,
        personalization: {
          events: [
            ...(userId
              ? [{ type: 'identify' as const, userId, traits: { identified: true } }]
              : []),
            { type: 'page' as const, properties: page },
          ],
        },
      },
      resolveOptions
    );
    // A redirect is an explicit outcome, never content: answer with an HTTP redirect.
    if (isDestinationRedirect(primary)) {
      res.redirect(302, destinationHref(primary.redirect.path, url.searchParams));
      return;
    }
    // Reference-only comparison: the configured node uses ordinary event-free fetch.
    let byNode: PortableRenderPlan | undefined;
    let nodeRedirect: string | undefined;
    try {
      const result = await request.fetchByDestinationNode(
        {
          destinationId,
          nodeId: destination.nodeId,
          personalization: {
            profileId: primary.personalization?.profile.id ?? request.profile?.id,
          },
        },
        resolveOptions
      );
      if (isDestinationRedirect(result)) nodeRedirect = result.redirect.path;
      else byNode = result;
    } catch {
      // Keep the primary content; the comparison presentation reports its own gap.
    }
    const sitemap = await sdk
      .fetchDestinationSitemap({ destinationId })
      .then(({ items }) =>
        items.map((item) => ({
          path: item.path,
          href: destinationHref(item.path, url.searchParams),
        }))
      )
      .catch(() => []);
    res.render('index', {
      ...view,
      destination: { configured: true, path, nodeId: destination.nodeId, sitemap },
      experiences: [
        { id: primary.experienceId, plan: primary, attributes: { 'data-destination-path': path } },
        {
          id: byNode?.experienceId,
          plan: byNode,
          attributes: { 'data-destination-node-id': destination.nodeId },
          redirect: nodeRedirect && {
            path: nodeRedirect,
            href: destinationHref(nodeRedirect, url.searchParams),
          },
        },
      ],
    });
  } finally {
    request.destroy();
  }
});

app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
  if (response.headersSent) return next(error);
  const notFound = error instanceof NotFoundError;
  response
    .status(notFound ? 404 : 502)
    .type('text/plain')
    .send(
      notFound
        ? 'The requested Experience or Destination path was not found.'
        : 'The SDK request failed.'
    );
});

const server = app.listen(port, '127.0.0.1', () => {
  process.stdout.write(
    `Experiences Node SDK ${EXPERIENCES_NODE_SDK_VERSION}: http://localhost:${port}\n`
  );
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => server.close());
}

import { referenceNode, pageContext } from '../dist/shared.js';
import {
  ContentfulExperiences,
  createRequestHandoffFromData,
  NotFoundError,
  type PortableRenderPlan,
} from '@contentful/experiences-node';
import {
  getTrackingAttributes,
  TRACKING_CLICKABLE_ATTRIBUTE,
} from '@contentful/experiences-web/tracking-attributes';
import { documentToHtmlString } from '@contentful/rich-text-html-renderer';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';
import { config, routes } from './config.js';
import { readVisitor, writeIdentity } from './cookies.js';

// Consumer integration: stable transports belong to the process; visitor state
// and request context belong only to the facade created inside each route.
const environment = config.publicEnvironment;
const sdk = new ContentfulExperiences({
  spaceId: environment.SPACE_ID,
  environmentId: environment.ENVIRONMENT_ID,
  locale: environment.LOCALE,
  delivery: { accessToken: environment.CDA_TOKEN },
});

const publicRoot = resolve(import.meta.dirname, '../public');
const app = express();
app.disable('x-powered-by');
app.enable('strict routing');
app.enable('case sensitive routing');
app.set('view engine', 'ejs');
app.set('views', import.meta.dirname);
app.locals.documentToHtmlString = documentToHtmlString;
app.locals.referenceNode = referenceNode;
app.locals.getTrackingAttributes = getTrackingAttributes;
app.locals.TRACKING_CLICKABLE_ATTRIBUTE = TRACKING_CLICKABLE_ATTRIBUTE;
app.use((request, response, next) => {
  response.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.set('Allow', 'GET, HEAD').status(405).type('text/plain').send('Method not allowed.');
    return;
  }
  let pathname: string;
  try {
    pathname = decodeURIComponent(request.originalUrl.split('?')[0]);
  } catch {
    response.status(400).type('text/plain').send('Invalid path.');
    return;
  }
  if (
    !pathname.startsWith('/') ||
    /[\\\0]/.test(pathname) ||
    pathname.split('/').some((segment) => segment.startsWith('.'))
  ) {
    response.status(404).type('text/plain').send('Not found.');
    return;
  }
  next();
});

// Maintainer: local liveness only; this handler never performs an SDK operation.
app.get('/health', (_request, response) => response.type('text/plain').send('ok'));
app.use(rateLimit({ windowMs: 30_000, max: 1000 }));
app.use(cookieParser());

for (const [path, route] of Object.entries(routes)) {
  app.get(path, async (req, res) => {
    const url = new URL(req.originalUrl, `${req.protocol}://${req.get('host')}`);
    const page = pageContext(url, req.get('referer') ?? '');
    const visitor = readVisitor(req.cookies);
    const request = sdk.forRequest({
      ...visitor,
      locale: environment.LOCALE,
      eventContext: { page, userAgent: req.get('user-agent') ?? 'node-js-server' },
    });
    try {
      // XDA workaround: an initial identify-bearing fetch can time out without a
      // profile. Await the committed page and require actual SDK-owned identity.
      const pageResult = await request.page({ properties: page });
      if (!pageResult.accepted || !request.profile?.id) {
        throw new Error('Page initialization did not establish a profile.');
      }
      const identifyRequested = req.query.userId === 'charles';
      const identify = identifyRequested
        ? request.eventBuilder.buildIdentify({ userId: 'charles', traits: { identified: true } })
        : undefined;
      const plans = new Map<string, PortableRenderPlan>();
      for (const experienceId of new Set([...route.automatic, ...route.manual])) {
        // XDA workaround: profile-only selection can return baseline for an
        // identified visitor. Reuse this cycle's bound identify per distinct fetch;
        // never independently send identify or reattach the committed page.
        plans.set(
          experienceId,
          await request.fetchExperience(
            {
              experienceId,
              extensions: { sourceMap: {} },
              ...(identify ? { personalization: { events: [identify] } } : {}),
            },
            { config: { components: {}, experienceTemplates: {} } }
          )
        );
      }
      // Consumer integration: package only final SDK request state, after every
      // sequential fetch. This public producer sends nothing and creates no replay.
      const handoff = createRequestHandoffFromData({
        spaceId: environment.SPACE_ID,
        environmentId: environment.ENVIRONMENT_ID,
        data: { profile: request.profile },
      });
      const bootstrap = JSON.stringify({ environment, handoff }).replaceAll('<', '\\u003c');
      writeIdentity(res, request, req.secure);
      res.render('index', { title: route.title, path, route, plans, identifyRequested, bootstrap });
    } catch (error) {
      // The SDK owns profile updates; the HTTP host alone writes response cookies.
      // Also expire denied identity when an upstream request fails.
      writeIdentity(res, request, req.secure);
      throw error;
    }
  });
}

// Consumer integration: only public/ is eligible for static hosting. Reject
// symlinks that resolve outside it; .env, templates and dependencies stay private.
app.use(async (request, response, next) => {
  const file = resolve(publicRoot, `.${decodeURIComponent(request.path)}`);
  try {
    const actual = await realpath(file);
    if (!actual.startsWith(`${publicRoot}${sep}`)) {
      response.status(404).type('text/plain').send('Not found.');
      return;
    }
    next();
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      response.status(404).type('text/plain').send('Not found.');
      return;
    }
    next(error);
  }
});
app.use(express.static(publicRoot, { dotfiles: 'deny', index: false, redirect: false }));
app.use((_request, response) => response.status(404).type('text/plain').send('Not found.'));
app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
  if (response.headersSent) return next(error);
  const notFound = error instanceof NotFoundError;
  response
    .status(notFound ? 404 : 502)
    .type('text/plain')
    .send(
      notFound
        ? 'An Experience was not found.'
        : 'Unable to render the application. Please try again.'
    );
});

const server = app.listen(config.port, '127.0.0.1', () => {
  process.stdout.write(`Node + Web SDK reference app: http://localhost:${config.port}\n`);
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => server.close());
}

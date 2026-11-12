import { referenceNode, pageContext } from '../dist/shared.js';
import {
  ContentfulExperiences,
  getPreviewSessionBinding,
  NotFoundError,
  type PortableRenderPlan,
  type ExperiencesHandoff,
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
  preview: config.preview,
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
    const binding =
      config.livePreviewEnabled && environment.LIVE_PREVIEW
        ? getPreviewSessionBinding(environment.LIVE_PREVIEW, url.searchParams)
        : undefined;
    const livePreview = binding
      ? {
          ...binding,
          loadImplementation: () => import('@contentful/experiences-live-preview'),
        }
      : undefined;
    const request = sdk.forRequest({
      // Preview content has no visitor identity/handoff prerequisite.
      ...(binding ? {} : readVisitor(req.cookies)),
      locale: environment.LOCALE,
      eventContext: { page, userAgent: req.get('user-agent') ?? 'node-js-server' },
      livePreview,
      isPreview: Boolean(binding),
    });
    try {
      const identifyRequested = !request.isPreview && req.query.userId === 'charles';
      let events = request.isPreview
        ? undefined
        : [
            ...(identifyRequested
              ? [
                  {
                    type: 'identify' as const,
                    userId: 'charles',
                    traits: { identified: true },
                  },
                ]
              : []),
            { type: 'page' as const, properties: page },
          ];
      const plans = new Map<string, PortableRenderPlan>();
      let handoff: ExperiencesHandoff | undefined;
      let contentError: unknown;
      const resolveOptions = { config: { components: {}, experienceTemplates: {} } };
      for (const experienceId of new Set([...route.automatic, ...route.manual])) {
        const options = {
          experienceId,
          ...(binding?.experienceId === experienceId ? {} : { extensions: { sourceMap: {} } }),
          ...(events ? { personalization: { events } } : {}),
        };
        if (events !== undefined) {
          events = undefined;
          const result = await request.fetchExperienceForHandoff(options, resolveOptions, {
            routeKey: req.originalUrl,
          });
          handoff = result.handoff;
          if (result.plan) plans.set(experienceId, result.plan);
          else contentError ??= result.error ?? new Error('Experience content is unavailable.');
        } else {
          try {
            const plan = await request.fetchExperience(options, resolveOptions);
            plans.set(experienceId, plan);
          } catch (error) {
            if (request.isPreview) throw error;
            contentError ??= error;
            // Keep available SSR plans and the initial operation's replay responsibility.
          }
        }
      }
      const initialPlans = request.isPreview
        ? Object.fromEntries(
            [...plans].map(([id, plan]) => [
              id,
              {
                ...plan,
                // Keep diagnostic counts without visitor profiles or upstream strings.
                personalization: undefined,
                deliveryDiagnostics: plan.deliveryDiagnostics?.map(() => ({})),
                diagnostics: plan.diagnostics.map(() => ({})),
              },
            ])
          )
        : undefined;
      if (!plans.size && contentError)
        res.status(contentError instanceof NotFoundError ? 404 : 502);
      const bootstrap = JSON.stringify({
        environment,
        handoff,
        preview: request.isPreview ? { binding, initialPlans } : undefined,
      }).replaceAll('<', '\\u003c');
      Object.assign(res.locals, {
        title: route.title,
        path,
        route,
        plans,
        identifyRequested,
        bootstrap,
      });
    } finally {
      request.destroy();
      // The SDK owns profile updates; the HTTP host alone writes response cookies.
      // Also expire denied identity when an upstream request fails.
      if (!request.isPreview) writeIdentity(res, request, req.secure);
    }
    res.render('index');
  });
}

// Consumer integration: only public/ is eligible for static hosting. Reject
// symlinks that resolve outside it; .env, templates and dependencies stay private.
app.use(async (request, response, next) => {
  const file = resolve(publicRoot, `.${decodeURIComponent(request.path)}`);
  if (!file.startsWith(`${publicRoot}${sep}`)) {
    response.status(404).type('text/plain').send('Not found.');
    return;
  }
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

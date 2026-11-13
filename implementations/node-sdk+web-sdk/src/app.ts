import { destinationHref, destinationPath, referenceNode, pageContext } from '../dist/shared.js';
import {
  ContentfulExperiences,
  getPreviewSessionBinding,
  isDestinationRedirect,
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
app.locals.destinationLinks = environment.DESTINATION_ID
  ? [
      { label: 'By path', href: destinationHref(environment.DESTINATION_PATH) },
      { label: 'Redirect', href: destinationHref(environment.DESTINATION_REDIRECT_PATH) },
      { label: 'Missing', href: destinationHref(environment.DESTINATION_MISSING_PATH) },
    ]
  : [];
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

function createRequest(req: Request) {
  const url = new URL(req.originalUrl, `${req.protocol}://${req.get('host')}`);
  const page = pageContext(url, req.get('referer') ?? '');
  const binding =
    config.livePreviewEnabled && environment.LIVE_PREVIEW
      ? getPreviewSessionBinding(environment.LIVE_PREVIEW, url.searchParams)
      : undefined;
  const preview = binding
    ? {
        sessionId: binding.sessionId,
        sessionHost: binding.sessionHost,
        resourceResolution: binding.resourceResolution,
      }
    : undefined;
  const request = sdk.forRequest({
    // Preview content has no visitor identity/handoff prerequisite.
    ...(binding ? {} : readVisitor(req.cookies)),
    locale: environment.LOCALE,
    preflight: true,
    eventContext: { page, userAgent: req.get('user-agent') ?? 'node-js-server' },
    preview,
  });
  const identifyRequested = !request.isPreview && req.query.userId === 'charles';
  const events = request.isPreview
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
  return { url, binding, request, identifyRequested, events };
}

for (const [path, route] of Object.entries(routes)) {
  if ('destination' in route) continue;
  app.get(path, async (req, res) => {
    const { binding, request, identifyRequested, ...intent } = createRequest(req);
    try {
      let events = intent.events;
      const plans = new Map<string, PortableRenderPlan>();
      let handoff: ExperiencesHandoff | undefined;
      let contentError: unknown;
      const resolveOptions = { config: { components: {}, experienceTemplates: {} } };
      for (const experienceId of new Set([...route.automatic, ...route.manual])) {
        const options = {
          experienceId,
          ...(request.isPreview ? {} : { extensions: { sourceMap: {} } }),
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

app.get('/destination', async (req, res) => {
  const { url, binding, request, identifyRequested, events } = createRequest(req);
  const destinationId = environment.DESTINATION_ID;
  const path = destinationPath(url.searchParams, environment.DESTINATION_PATH);
  let redirect: string | undefined;
  try {
    let handoff: ExperiencesHandoff | undefined;
    const items: { selector: string; plan?: PortableRenderPlan; message?: string }[] = [];
    if (destinationId) {
      // Destinations are space-scoped: no locale, parameters or extensions (no source map).
      const resolveOptions = { config: { components: {}, experienceTemplates: {} } };
      let plan: PortableRenderPlan | undefined;
      let contentError: unknown;
      if (events !== undefined) {
        // Actual server-to-browser transfer for the by-path primary, like the by-ID routes.
        const result = await request.fetchDestinationForHandoff(
          { destinationId, path, personalization: { events } },
          resolveOptions,
          { routeKey: req.originalUrl }
        );
        // A redirect carries a replay-free handoff that is never sent to the browser.
        if (result.redirect) redirect = result.redirect.path;
        else {
          handoff = result.handoff;
          plan = result.plan;
          contentError = result.plan ? undefined : (result.error ?? new Error('Unavailable.'));
        }
      } else {
        // Destinations have no native preview; preview requests read ordinary Delivery.
        try {
          const result = await request.fetchByDestinationPath(
            { destinationId, path },
            resolveOptions
          );
          if (isDestinationRedirect(result)) redirect = result.redirect.path;
          else plan = result;
        } catch (error) {
          contentError = error;
        }
      }
      // A missing path renders with 404, like a missing by-ID Experience: the evaluated
      // replay survives content failure and the browser still admits it.
      if (contentError instanceof NotFoundError) {
        res.status(404);
        items.push({ selector: 'path', message: 'This Destination path was not found.' });
      } else if (redirect === undefined) {
        items.push({
          selector: 'path',
          plan,
          message: plan ? undefined : 'This Destination path could not be loaded.',
        });
        // Reference-only comparison: ordinary event-free fetch, never handoff input.
        try {
          const result = await request.fetchByDestinationNode(
            { destinationId, nodeId: environment.DESTINATION_NODE_ID },
            resolveOptions
          );
          items.push(
            isDestinationRedirect(result)
              ? {
                  selector: 'node',
                  message: `This Destination node redirects to ${result.redirect.path}.`,
                }
              : { selector: 'node', plan: result }
          );
        } catch {
          items.push({ selector: 'node', message: 'This Destination node could not be loaded.' });
        }
        if (!plan) res.status(502);
      }
    }
    const bootstrap = JSON.stringify({
      environment,
      handoff,
      preview: request.isPreview ? { binding, initialPlans: {} } : undefined,
    }).replaceAll('<', '\\u003c');
    Object.assign(res.locals, {
      title: routes['/destination'].title,
      path: '/destination',
      route: routes['/destination'],
      plans: new Map(),
      identifyRequested,
      bootstrap,
      destination: {
        summary: destinationId
          ? `Path ${path} and node ${environment.DESTINATION_NODE_ID}`
          : 'Destination not configured. Set DESTINATION_ID in implementations/node-sdk+web-sdk/.env.',
        items,
      },
    });
  } finally {
    request.destroy();
    if (!request.isPreview) writeIdentity(res, request, req.secure);
  }
  if (redirect !== undefined) {
    res.redirect(302, destinationHref(redirect, url.search));
    return;
  }
  res.render('index');
});

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

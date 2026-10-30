/* global Response */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import {
  NotFoundError,
  fetchExperience,
  fetchPreviewSession,
  type PortableRenderPlan,
} from '@contentful/experiences-angular';
import express from 'express';

import { experienceConfig } from './app/lib/experience-config.js';
import { buildPagePersonalization } from './app/lib/personalization.js';
import type { ConsentConfig } from './app/lib/consent-config.js';
import type { ExperienceRouteData } from './app/lib/experience-route-data.js';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  })
);

type LoadResult = ExperienceRouteData | { redirect: string } | undefined;

// `/experiences/:id` fetches one Experience by id; every other path is a
// Destination path.
const BY_ID_ROUTE = /^\/experiences\/([^/]+)\/?$/;

/**
 * The Angular analogue of SvelteKit's `+page.server.ts` load: fetch on the
 * server only, then hand the result to the app as `requestContext`.
 *
 * A route resolver would be the closer-looking analogue, but resolvers also run
 * in the browser during client-side navigation — which would ship the CDA/CPA
 * tokens to the client. Doing it here keeps them server-side, and
 * `ExperienceStore` relays the plan to the browser through `TransferState`.
 */
async function loadExperience(req: express.Request): Promise<LoadResult> {
  const url = new URL(req.originalUrl, `http://${req.headers.host ?? 'localhost'}`);
  const pathname = url.pathname;

  // `.`-bearing paths are unmatched static assets falling through `express.static`.
  if (pathname.includes('.')) return undefined;

  const spaceId = process.env['SPACE_ID'];
  const accessToken = process.env['CDA_TOKEN'];
  if (!spaceId || !accessToken) {
    throw new Error(
      'SPACE_ID and CDA_TOKEN must be set. Copy .env.example to .env and fill them in.'
    );
  }

  const byId = BY_ID_ROUTE.exec(pathname);
  const path = `/${pathname.replace(/^\/+|\/+$/g, '')}`;
  const slug = byId ? decodeURIComponent(byId[1]!) : path;

  const preview = url.searchParams.get('preview');
  const debugParam = url.searchParams.get('debug');
  const debug = debugParam === 'true' || debugParam === '1';
  const sessionId = url.searchParams.get('preview_session_id') ?? undefined;
  const locale = url.searchParams.get('locale') ?? 'en-US';
  const personalizationParam = url.searchParams.get('personalization');
  const personalizationEnabled = personalizationParam === 'true' || personalizationParam === '1';
  const environmentId = process.env['ENVIRONMENT_ID'] || 'master';
  const previewToken = process.env['CPA_TOKEN'];
  const previewSessionOptions = { spaceId, environmentId, previewToken, sessionId };
  const livePreview = byId !== null && sessionId !== undefined && previewToken !== undefined;
  const previewMode = byId !== null && (preview === 'true' || preview === '1' || livePreview);
  // Opaque to the SDK; `card`'s resolveData hook reads both keys.
  const metadata = { slug, locale };

  // Only send a page event when `?personalization=true` is explicitly present.
  const personalization = personalizationEnabled
    ? buildPagePersonalization({
        origin: url.origin,
        path: url.pathname,
        locale,
        referrer: req.headers['referer'] ?? '',
        searchParams: Object.fromEntries(
          [...new Set(url.searchParams.keys())].map((key) => {
            const values = url.searchParams.getAll(key);
            return [key, values.length === 1 ? values[0] : values];
          })
        ),
      })
    : undefined;

  const notFound: ExperienceRouteData = {
    slug,
    metadata,
    experience: null,
    debug,
    livePreview,
    previewSessionOptions,
    notFound: true,
  };

  try {
    const resolveOptions = {
      config: experienceConfig,
      metadata,
      debug,
    };

    let experience: PortableRenderPlan;
    if (byId) {
      experience = livePreview
        ? await fetchPreviewSession(
            { spaceId, environmentId, sessionId },
            { previewToken },
            resolveOptions
          )
        : await fetchExperience(
            {
              spaceId,
              environmentId,
              experienceId: slug,
              locale,
              personalization,
            },
            {
              accessToken,
              previewToken,
              preview: previewMode,
            },
            resolveOptions
          );
    } else {
      const destinationId = process.env['DESTINATION_ID'];
      if (!destinationId) {
        throw new Error(
          'DESTINATION_ID must be set. Copy .env.example to .env, fill it in, and run the bootstrap in examples/scripts.'
        );
      }
      // The URL path is the Destination path. A Destination resolves to either a
      // plan or a redirect the app must follow. Preview is not supported on
      // Destinations, so no `previewToken` or `preview` flag is passed; use the
      // /experiences/:id route for preview.
      const result = await fetchExperience(
        { spaceId, destinationId, path, personalization },
        { accessToken },
        resolveOptions
      );
      if ('redirect' in result) return { redirect: result.redirect.path };
      experience = result;
    }

    // The plan carries these values. `debug` is relayed so the page can
    // demonstrate the renderer's override input.
    return {
      slug,
      metadata,
      experience,
      debug,
      livePreview,
      previewSessionOptions,
      notFound: false,
    };
  } catch (error) {
    if (error instanceof NotFoundError) return notFound;
    throw error;
  }
}

app.use(async (req, res, next) => {
  try {
    const context = await loadExperience(req);
    if (context && 'redirect' in context) {
      res.redirect(307, context.redirect);
      return;
    }
    const consent: ConsentConfig = {
      spaceId: process.env['SPACE_ID'] ?? '',
      environmentId: process.env['ENVIRONMENT_ID'] || 'master',
      accessToken: process.env['CDA_TOKEN'] ?? '',
    };
    // `consent` rides along on every request; the experience data only on experience routes.
    const response = await angularApp.handle(req, { ...context, consent });
    if (!response) {
      next();
      return;
    }

    // `writeResponseToNodeResponse` copies the source status, and `Response.status`
    // is read-only — so a 404 has to be a new Response around the same body.
    const outgoing =
      context?.notFound === true
        ? new Response(response.body, { status: 404, headers: response.headers })
        : response;

    await writeResponseToNodeResponse(outgoing, res);
  } catch (error) {
    next(error);
  }
});

if (isMainModule(import.meta.url)) {
  const port = process.env['PORT'] ? Number(process.env['PORT']) : 4000;
  app.listen(port, () => {
    console.log(`Angular example listening on http://localhost:${port}`);
  });
}

/** Consumed by `@angular/build:dev-server` and by any Node adapter. */
export const reqHandler = createNodeRequestHandler(app);

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import { NotFoundError, fetchExperience } from '@contentful/experiences-angular';
import express from 'express';

import { detectViewportFromUserAgent } from './app/lib/detect-viewport.js';
import { experienceConfig } from './app/lib/experience-config.js';
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

/**
 * The Angular analogue of SvelteKit's `+page.server.ts` load: fetch on the
 * server only, then hand the result to the app as `requestContext`.
 *
 * A route resolver would be the closer-looking analogue, but resolvers also run
 * in the browser during client-side navigation — which would ship the CDA/CPA
 * tokens to the client. Doing it here keeps them server-side, and
 * `ExperienceStore` relays the plan to the browser through `TransferState`.
 */
async function loadExperience(req: express.Request): Promise<ExperienceRouteData | undefined> {
  const url = new URL(req.originalUrl, `http://${req.headers.host ?? 'localhost'}`);
  const slug = url.pathname.replace(/^\/+|\/+$/g, '');

  // Only the single-segment `:slug` route renders an experience. `.`-bearing
  // paths are unmatched static assets falling through `express.static`.
  if (!slug || slug.includes('/') || slug.includes('.')) return undefined;

  const spaceId = process.env['SPACE_ID'];
  const accessToken = process.env['CDA_TOKEN'];
  if (!spaceId || !accessToken) {
    throw new Error(
      'SPACE_ID and CDA_TOKEN must be set. Copy .env.example to .env and fill them in.'
    );
  }

  const preview = url.searchParams.get('preview');
  const previewMode = preview === 'true' || preview === '1';
  const debugParam = url.searchParams.get('debug');
  const debug = debugParam === 'true' || debugParam === '1';
  const locale = url.searchParams.get('locale') ?? 'en-US';
  const initialViewportId = detectViewportFromUserAgent(req.headers['user-agent'] ?? '');
  // Opaque to the SDK; `card`'s resolveData hook reads both keys.
  const metadata = { slug, locale };

  try {
    const experience = await fetchExperience(
      {
        spaceId,
        environmentId: process.env['ENVIRONMENT_ID'] || 'master',
        experienceId: slug,
        locale,
      },
      {
        accessToken,
        previewToken: process.env['CPA_TOKEN'],
        preview: previewMode,
      },
      {
        config: experienceConfig,
        metadata,
        debug,
        initialViewportId,
      }
    );

    // The plan carries all of these. `debug` and `initialViewportId` are relayed
    // as well only so the page can demonstrate the renderer's override inputs.
    return { slug, experience, debug, initialViewportId, notFound: false };
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { slug, experience: null, debug, initialViewportId, notFound: true };
    }
    throw error;
  }
}

app.use(async (req, res, next) => {
  try {
    const context = await loadExperience(req);
    const response = await angularApp.handle(req, context);
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

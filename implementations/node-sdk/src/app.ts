import {
  ContentfulExperiences,
  EXPERIENCES_NODE_SDK_VERSION,
  NotFoundError,
} from '@contentful/experiences-node';
import { documentToHtmlString } from '@contentful/rich-text-html-renderer';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

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

const sdk = new ContentfulExperiences({
  spaceId: required('SPACE_ID'),
  environmentId: required('ENVIRONMENT_ID'),
  delivery: { accessToken: required('CDA_TOKEN') },
  ...(process.env.LIVE_PREVIEW_ENABLED === 'true'
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
app.get('/health', (_request, response) => response.type('text/plain').send('ok'));
app.use((_request, response, next) => {
  response.set('Cache-Control', 'private, no-store');
  next();
});
app.use(rateLimit({ windowMs: 30_000, max: 1000 }));

app.get('/', async (req, res) => {
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
  const sessionId = url.searchParams.has('preview_session_id')
    ? url.searchParams.get('preview_session_id')?.trim()
    : process.env.LIVE_PREVIEW_SESSION_ID?.trim();
  const previewExperienceId =
    url.searchParams.get('preview_experience_id')?.trim() ||
    process.env.LIVE_PREVIEW_EXPERIENCE_ID?.trim() ||
    experienceIds[0];
  const livePreview =
    process.env.LIVE_PREVIEW_ENABLED === 'true' && sessionId
      ? async () => {
          return {
            experienceId: previewExperienceId,
            sessionId,
            resourceResolution: process.env.LIVE_PREVIEW_RESOURCE_RESOLUTION?.trim() || undefined,
            implementation: await import('@contentful/experiences-live-preview'),
          };
        }
      : undefined;
  const request = sdk.forRequest({
    consent: true,
    locale,
    eventContext,
    livePreview,
    // A session URL still suppresses events if this deployment disables preview.
    ...(livePreview
      ? {}
      : { isPreview: Boolean(url.searchParams.get('preview_session_id')?.trim()) }),
  });
  try {
    const identifyRequested = !request.isPreview && Boolean(userId);
    if (!request.isPreview) {
      // Await explicit identity evaluation before selecting content. Event failure
      // still permits content with the profile the SDK currently holds.
      if (identifyRequested && userId)
        await request.identify({ userId, traits: { identified: true } }).catch(() => {});
      await request.page({ properties: page }).catch(() => {});
    }
    const resolveOptions = { config: { components: {}, experienceTemplates: {} } };
    const plans = new Map(
      await Promise.all(
        [...new Set(experienceIds)].map(
          async (experienceId) =>
            [experienceId, await request.fetchExperience({ experienceId }, resolveOptions)] as const
        )
      )
    );
    const experiences = experienceIds.map((id) => ({ id, plan: plans.get(id)! }));

    res.render('index', {
      isPreview: request.isPreview,
      identifyRequested,
      experiences,
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
    .send(notFound ? 'An Experience was not found.' : 'The SDK request failed.');
});

const server = app.listen(port, '127.0.0.1', () => {
  process.stdout.write(
    `Experiences Node SDK ${EXPERIENCES_NODE_SDK_VERSION}: http://localhost:${port}\n`
  );
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => server.close());
}

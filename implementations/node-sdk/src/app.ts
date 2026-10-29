import {
  ContentfulExperiences,
  EXPERIENCES_NODE_SDK_VERSION,
  NotFoundError,
  type PortableRenderPlan,
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
      ? {
          experienceId: previewExperienceId,
          sessionId,
          resourceResolution: process.env.LIVE_PREVIEW_RESOURCE_RESOLUTION?.trim() || undefined,
          loadImplementation: () => import('@contentful/experiences-live-preview'),
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
        profileId = plan.personalization?.profileId ?? profileId;
        plans.set(experienceId, plan);
      } catch (error) {
        if (request.isPreview) throw error;
        contentError ??= error;
      }
    }
    if (!plans.size) res.status(contentError instanceof NotFoundError ? 404 : 502);
    const experiences = experienceIds.map((id) => ({ id, plan: plans.get(id) }));

    res.render('index', { isPreview: request.isPreview, identifyRequested, experiences });
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

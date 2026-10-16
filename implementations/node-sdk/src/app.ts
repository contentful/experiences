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
const defaultExperienceIds = ['6fQzPrHjFX25yTwi2Ic5gs', '6fm371os680MYgg0XThK2S'];
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
  const request = sdk.forRequest({
    consent: true,
    locale,
    eventContext: { page, userAgent: req.get('user-agent') ?? 'node-js-server' },
  });

  const pageResult = await request.page({ properties: page });
  let data = pageResult.accepted ? pageResult.data : undefined;
  if (userId) {
    const identifyResult = await request.identify({ userId, traits: { identified: true } });
    data = (identifyResult.accepted ? identifyResult.data : undefined) ?? data;
  }
  if (!data) throw new Error('The runtime did not return profile data.');

  const experiences: { id: string; plan: PortableRenderPlan }[] = [];
  for (const experienceId of experienceIds) {
    const plan = await request.fetchExperience(
      { experienceId },
      { config: { components: {}, experienceTemplates: {} } }
    );
    experiences.push({ id: experienceId, plan });
  }

  res.render('index', { profile: data.profile, experiences });
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

import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import process from 'node:process';
import { config } from './config.js';

const publicRoot = resolve(import.meta.dirname, '../public');
const app = express();
app.disable('x-powered-by');
app.enable('strict routing');
app.enable('case sensitive routing');
app.set('view engine', 'ejs');
app.set('views', import.meta.dirname);
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

// Maintainer: local liveness only. No SDK instance or upstream request is needed.
app.get('/health', (_request, response) => response.type('text/plain').send('ok'));
app.use(rateLimit({ windowMs: 30_000, max: 1000 }));

// Reference app: explicit document routes. Content rendering starts in Phase 3.
app.get('/', (_request, response) => response.render('index', { title: 'Home', path: '/' }));
app.get('/page-two', (_request, response) =>
  response.render('index', { title: 'Page Two', path: '/page-two' })
);

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
  response.status(500).type('text/plain').send('Unable to serve the application.');
});

const server = app.listen(config.port, '127.0.0.1', () => {
  process.stdout.write(`Node + Web SDK reference foundation: http://localhost:${config.port}\n`);
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => server.close());
}

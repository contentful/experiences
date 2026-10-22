import { parse } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import process from 'node:process';

const root = resolve(import.meta.dirname, 'public');
const localEnvironment = resolve(import.meta.dirname, '.env');
const env = parse(
  readFileSync(existsSync(localEnvironment) ? localEnvironment : `${localEnvironment}.example`)
);
for (const name of ['SPACE_ID', 'ENVIRONMENT_ID', 'CDA_TOKEN']) {
  if (!env[name]?.trim())
    throw new Error(`Missing ${name}: configure implementations/web-sdk/.env`);
}
const port = Number(env.PORT || 3200);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT in implementations/web-sdk/.env must be an integer between 1 and 65535.');
}

const defaultExperienceIds = [
  '3fLAdFb3BYAuImRhcW8k4t',
  '4WzbgzPQHa9Tr2ffbOU8p7',
  '7u2eP09B4BIBToH8UwSHck',
];
const experienceIds = env.EXPERIENCE_IDS?.split(',')
  .map((id) => id.trim())
  .filter(Boolean);
// CDA_TOKEN is the sole intentionally public credential. No process.env spread.
const publicEnvironment = {
  SPACE_ID: env.SPACE_ID,
  ENVIRONMENT_ID: env.ENVIRONMENT_ID,
  CDA_TOKEN: env.CDA_TOKEN,
  LOCALE: env.LOCALE || 'en-US',
  EXPERIENCE_IDS: experienceIds?.length ? [...new Set(experienceIds)] : defaultExperienceIds,
};
const environmentScript = `<script>window.ENVIRONMENT = ${JSON.stringify(publicEnvironment).replaceAll('<', '\\u003c')}</script>`;
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const respond = (status: number, body: string, type = 'text/plain; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'private, no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    respond(405, 'Method not allowed');
    return;
  }

  let pathname: string;
  try {
    // Check the original path before URL normalization can remove traversal segments.
    pathname = decodeURIComponent((req.url ?? '/').split('?')[0]);
  } catch {
    respond(400, 'Invalid path');
    return;
  }
  if (
    !pathname.startsWith('/') ||
    /[\\\0]/.test(pathname) ||
    pathname.split('/').some((segment) => segment.startsWith('.'))
  ) {
    respond(403, 'Forbidden');
    return;
  }
  if (pathname === '/health') {
    respond(200, JSON.stringify({ status: 'ok' }), 'application/json; charset=utf-8');
    return;
  }

  const file = resolve(root, pathname === '/' ? 'index.html' : pathname.slice(1));
  try {
    const actual = await realpath(file);
    if (!actual.startsWith(`${root}${sep}`)) {
      respond(403, 'Forbidden');
      return;
    }
    if (!(await stat(actual)).isFile()) {
      respond(404, 'Not found');
      return;
    }
    const raw = await readFile(actual);
    const extension = extname(actual);
    if (extension === '.html') {
      respond(
        200,
        raw
          .toString('utf8')
          .replace('<script data-env-placeholder></script>', () => environmentScript),
        mime[extension]
      );
    } else {
      res.writeHead(200, { 'Content-Type': mime[extension] ?? 'application/octet-stream' });
      res.end(req.method === 'HEAD' ? undefined : raw);
    }
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== 'ENOENT' && code !== 'ENOTDIR') {
      respond(500, 'Unable to read application asset');
      return;
    }
    // Only route paths get the SPA shell. Missing assets and API paths stay errors.
    if (extname(pathname) || /^\/(css|js|dist|api)(\/|$)/.test(pathname)) {
      respond(404, 'Not found');
      return;
    }
    try {
      const index = await realpath(resolve(root, 'index.html'));
      if (!index.startsWith(`${root}${sep}`)) {
        respond(403, 'Forbidden');
        return;
      }
      const html = await readFile(index, 'utf8');
      respond(
        200,
        html.replace('<script data-env-placeholder></script>', () => environmentScript),
        mime['.html']
      );
    } catch {
      respond(500, 'Unable to read application shell');
    }
  }
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Web SDK reference app running at http://localhost:${port}\n`);
});

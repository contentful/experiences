import { parse } from 'dotenv';
import type { Buffer } from 'node:buffer';
import { constants, existsSync, readFileSync } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import process from 'node:process';

import { getPublicEnvironment } from './public-config.js';

// Reference app: serve only Vite output, with app-local browser configuration.
// This host performs no SDK or upstream operations.
const root = resolve(import.meta.dirname, 'dist');
const localEnvironment = resolve(import.meta.dirname, '.env');
const env = parse(
  readFileSync(existsSync(localEnvironment) ? localEnvironment : `${localEnvironment}.example`)
);
const port = Number(env.PORT?.trim() || 3400);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT in implementations/react-sdk/.env must be an integer between 1 and 65535.');
}

// Consumer integration: project only approved browser values; escape inline JSON.
// Delivery credentials supplied here must be approved for browser exposure.
const environmentScript = `<script>window.ENVIRONMENT = ${JSON.stringify(getPublicEnvironment(env)).replaceAll('<', '\\u003c')}</script>`;
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
    // Maintainer: process liveness only; this does not check SDK/upstream readiness.
    respond(200, JSON.stringify({ status: 'ok' }), 'application/json; charset=utf-8');
    return;
  }

  const file = resolve(root, pathname === '/' ? 'index.html' : pathname.slice(1));
  if (!file.startsWith(`${root}${sep}`)) {
    respond(403, 'Forbidden');
    return;
  }
  try {
    const actual = await realpath(file);
    if (!actual.startsWith(`${root}${sep}`)) {
      respond(403, 'Forbidden');
      return;
    }
    // Check and read the same opened file; reject a symlink swapped in after realpath.
    const handle = await open(actual, constants.O_RDONLY | constants.O_NOFOLLOW);
    let raw: Buffer;
    try {
      if (!(await handle.stat()).isFile()) {
        respond(404, 'Not found');
        return;
      }
      raw = await handle.readFile();
    } finally {
      await handle.close();
    }
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
    if (extname(pathname) || /^\/(assets|css|js|dist|api)(\/|$)/.test(pathname)) {
      respond(404, 'Not found');
      return;
    }
    try {
      const index = await realpath(resolve(root, 'index.html'));
      if (!index.startsWith(`${root}${sep}`)) {
        respond(403, 'Forbidden');
        return;
      }
      const handle = await open(index, constants.O_RDONLY | constants.O_NOFOLLOW);
      const html = await handle.readFile('utf8').finally(() => handle.close());
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
  process.stdout.write(`React SDK reference app running at http://localhost:${port}\n`);
});

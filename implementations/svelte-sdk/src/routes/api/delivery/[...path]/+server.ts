import type { RequestHandler } from './$types';
import { getServerConfiguration } from '#lib/server/config.js';
// Fixed upstream, scope and ID allowlist. No private token or upstream headers are returned.
const proxy: RequestHandler = async ({ request, params, url }) => {
  const reject = (message: string, status: number) =>
    new Response(message, {
      status,
      headers: { 'cache-control': 'private, no-store' },
    });
  let configuration;
  try {
    configuration = getServerConfiguration();
  } catch {
    return reject('Configure server Delivery credentials.', 503);
  }
  const { node, browser, origin } = configuration;
  if (request.headers.get('origin') && request.headers.get('origin') !== origin)
    return reject('Invalid origin', 403);
  if (request.method === 'POST' && request.headers.get('origin') !== origin)
    return reject('Same-origin mutations only', 403);
  if (['access_token', 'preview'].some((key) => url.searchParams.has(key)))
    return reject('Unsupported query parameter', 400);
  const path = params.path?.split('/') ?? [];
  if (
    path.length !== 6 ||
    path[0] !== 'spaces' ||
    path[1] !== node.spaceId ||
    path[2] !== 'environments' ||
    path[3] !== node.environmentId ||
    path[4] !== 'experiences' ||
    !browser.experienceIds.includes(path[5])
  )
    return reject('Unknown Experience', 404);
  if (
    request.method === 'POST' &&
    !request.headers.get('content-type')?.startsWith('application/json')
  )
    return reject('JSON required', 415);
  const headers = new Headers({ authorization: `Bearer ${node.delivery.accessToken}` });
  for (const name of [
    'x-contentful-enable-alpha-feature',
    'x-contentful-exo-enable-api-names',
    'x-contentful-user-agent',
  ]) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  let body: string | undefined;
  if (request.method === 'POST') {
    // Bound bytes while reading, including requests without Content-Length.
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader)
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > 262144) {
          await reader.cancel();
          return reject('Request too large', 413);
        }
        chunks.push(next.value);
      }
    body = Buffer.concat(chunks).toString('utf8');
    headers.set('content-type', 'application/json');
  }
  const upstreamUrl = new URL(
    path.map(encodeURIComponent).join('/'),
    'https://xdn.contentful.com/'
  );
  upstreamUrl.search = url.search;
  try {
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      body,
      headers,
      cache: 'no-store',
      redirect: 'error',
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
        'cache-control': 'private, no-store',
      },
    });
  } catch {
    return reject('Delivery unavailable', 502);
  }
};
export const GET = proxy;
export const POST = proxy;

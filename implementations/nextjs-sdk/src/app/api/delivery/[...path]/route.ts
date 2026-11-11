import { NextResponse, type NextRequest } from 'next/server';
import { getServer } from '../../../../config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Real Delivery passthrough, limited to this app's scope and configured IDs.
// Browser clients omit bearer auth; only this server supplies the private token.
async function proxy(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  if (['access_token', 'preview'].some((key) => request.nextUrl.searchParams.has(key)))
    return new NextResponse('Unsupported Delivery query parameter', { status: 400 });
  const { config } = getServer();
  const path = (await params).path;
  if (request.headers.get('origin') && request.headers.get('origin') !== config.origin)
    return new NextResponse('Invalid origin', { status: 403 });
  if (
    path.length !== 6 ||
    path[0] !== 'spaces' ||
    path[1] !== config.spaceId ||
    path[2] !== 'environments' ||
    path[3] !== config.environmentId ||
    path[4] !== 'experiences' ||
    !config.experienceIds.includes(path[5])
  )
    return new NextResponse('Unknown Experience', { status: 404 });
  const url = new URL(path.map(encodeURIComponent).join('/'), 'https://xdn.contentful.com/');
  url.search = request.nextUrl.search;
  const headers = new Headers({ Authorization: `Bearer ${config.delivery.accessToken}` });
  // Preserve generated-client wire conventions, including its rename header;
  // authentication remains proxy-owned rather than caller-supplied.
  for (const name of ['x-contentful-enable-alpha-feature', 'x-contentful-exo-enable-api-names']) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  const body = request.method === 'POST' ? await request.text() : undefined;
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  const upstream = await fetch(url, {
    method: request.method,
    headers,
    body,
    cache: 'no-store',
    redirect: 'error',
  });
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'private, no-store',
    },
  });
}
export const GET = proxy;
export const POST = proxy;

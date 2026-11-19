import { building } from '$app/env';
import type { RequestHandler } from './$types';
import { getBinding } from '#lib/server/experiences.js';
export const POST: RequestHandler = (event) => {
  if (building) return new Response('Unavailable during build', { status: 503 });
  try {
    return getBinding().request.handlePreparation(event);
  } catch {
    return new Response('Configure the reference before preparing content.', { status: 503 });
  }
};

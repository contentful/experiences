'use server';

import { cookies, headers } from 'next/headers';
import { persistAnonymousId } from '@contentful/experiences-nextjs/server';
import type { FetchExperienceOptions } from '@contentful/experiences-node';
import { getServer } from '../../config';
import { createContentRequest, loadReferenceContent } from '../../server-reference';
import { ServerPresentations } from '../../components/ServerPresentations';

// A Server Action is a writable cookie boundary and returns a normal RSC subtree.
export async function updateServerContent(
  routeKey: string,
  personalization?: FetchExperienceOptions['personalization']
) {
  const { config } = getServer();
  const url = new URL(routeKey, config.origin);
  if (url.origin !== config.origin || !['/', '/page-two'].includes(url.pathname))
    throw new Error('Unknown reference route.');
  const cookieStore = await cookies();
  const request = createContentRequest(url, new Headers(await headers()), cookieStore);
  try {
    const all = await loadReferenceContent(request, url, personalization);
    const currentId = cookieStore.get('ctfl-opt-aid')?.value;
    // Next rerenders the current route after a cookie mutation. Avoid repeating
    // content work when the evaluated identity has not changed.
    if (request.canPersistProfile ? request.profile?.id !== currentId : currentId !== undefined)
      persistAnonymousId({ headers: new Headers(), cookies: cookieStore }, request, {
        cookieOptions: { httpOnly: false, secure: url.protocol === 'https:' },
      });
    return <ServerPresentations all={all} routeKey={routeKey} ids={config.experienceIds} />;
  } finally {
    request.destroy();
  }
}

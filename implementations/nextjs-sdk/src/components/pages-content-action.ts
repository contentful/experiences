import type { FetchExperienceOptions } from '@contentful/experiences-web';

// GSSP sees the action; the router's committed route remains the visible page.
export function pagesContentActionUrls(
  routeKey: string,
  personalization?: FetchExperienceOptions['personalization']
) {
  const url = new URL(routeKey, 'https://nextjs.invalid');
  const visibleHref = url.pathname + url.search;
  const event = personalization?.events?.[0];
  if (event?.type === 'identify') url.searchParams.set('userId', 'charles');
  url.searchParams.set(
    'action',
    event?.type === 'identify' ? 'identify' : event?.type === 'track' ? 'track' : 'retry'
  );
  url.searchParams.set('actionRouteKey', visibleHref);
  return { internalHref: url.pathname + url.search, visibleHref };
}

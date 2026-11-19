import type { PortableRenderPlan } from '@contentful/experiences-svelte';
export type ReferenceMode = 'ssr' | 'hybrid' | 'csr';
export type ReferencePath = `/${ReferenceMode}${'' | '/page-two' | '/single-experience'}`;
export interface ReferenceRoute {
  mode: ReferenceMode;
  routeKey: string;
  pathname: ReferencePath;
  title: string;
  ids: string[];
  initialIdentify: boolean;
  debug: boolean;
}
export interface Comparison {
  experienceId: string;
  plan?: PortableRenderPlan;
  error?: string;
  warning?: string;
}
export function referencePageTitle({ title, mode }: ReferenceRoute) {
  return `${title} – Contentful Experiences (${mode})`;
}
export const consentCookies = {
  events: 'experiences-svelte-event-consent',
  persistence: 'experiences-svelte-persistence-consent',
};
export function isPreviewRequested(searchParams: Pick<URLSearchParams, 'get'>, enabled: boolean) {
  return enabled && Boolean(searchParams.get('preview_session_id')?.trim());
}
export function readRoute(url: URL): ReferenceRoute {
  const mode = url.pathname.split('/')[1] as ReferenceMode;
  const pageTwo = url.pathname.endsWith('/page-two');
  const single = url.pathname.endsWith('/single-experience');
  const ids = __REFERENCE_ENVIRONMENT__.experienceIds;
  return {
    mode,
    routeKey: url.pathname + url.search,
    pathname: url.pathname as ReferencePath,
    title: single ? 'Single Experience' : pageTwo ? 'Page Two' : 'Svelte SDK',
    ids: single ? ids.slice(0, 1) : pageTwo ? ids.slice(-1) : ids,
    initialIdentify: url.searchParams.get('userId') === 'charles',
    debug: url.searchParams.has('debug'),
  };
}
export function routeUrl(
  path: ReferencePath,
  current: { href: string; searchParams: { get(name: string): string | null } }
) {
  const url = new URL(path, current.href);
  for (const key of ['userId', 'preview_session_id', 'debug']) {
    const value = current.searchParams.get(key);
    if (value !== null) url.searchParams.set(key, value);
  }
  return `${path}${url.search}` as `${ReferencePath}${'' | `?${string}`}`;
}

/** Initial URL Identify is claimed by acquisition, not by a page component's lifetime. */
export function createInitialIdentifyClaim(readInitialIdentify: () => boolean) {
  let claimed = false;
  return () => {
    if (claimed) return false;
    claimed = true;
    return readInitialIdentify();
  };
}

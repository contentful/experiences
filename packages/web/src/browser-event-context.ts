import { DEFAULT_PAGE_PROPERTIES, type EventBuilderConfig } from '@contentful/experiences-runtime';

type Page = ReturnType<NonNullable<EventBuilderConfig['getPageProperties']>>;

/**
 * Reads the current browser page at event-build time. Keeping this lazy makes
 * navigation updates visible to an existing SDK instance and keeps SSR safe.
 */
export function getPageProperties(): Page {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { ...DEFAULT_PAGE_PROPERTIES };
  }

  try {
    const { location } = window;
    const query = Object.fromEntries(new URL(location.href).searchParams.entries());

    return {
      ...DEFAULT_PAGE_PROPERTIES,
      url: location.href,
      path: location.pathname,
      query,
      search: location.search,
      hash: location.hash,
      referrer: document.referrer,
      title: document.title,
      width: window.innerWidth,
      height: window.innerHeight,
    };
  } catch {
    return { ...DEFAULT_PAGE_PROPERTIES };
  }
}

/** Returns the current browser user agent, or no value outside a browser. */
export function getUserAgent(): string | undefined {
  return typeof window === 'undefined' || typeof window.navigator === 'undefined'
    ? undefined
    : window.navigator.userAgent;
}

import { DEFAULT_PAGE_PROPERTIES, type EventBuilderConfig } from '@contentful/experiences-runtime';

type Page = ReturnType<NonNullable<EventBuilderConfig['getPageProperties']>>;
// Temporary XDA workaround: page context does not accept title, hash, width or height.
const { title: _title, ...defaultPage } = DEFAULT_PAGE_PROPERTIES;

/**
 * Reads the current browser page at event-build time. Keeping this lazy makes
 * navigation updates visible to an existing SDK instance and keeps SSR safe.
 */
export function getPageProperties(): Page {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { ...defaultPage };
  }

  try {
    const { location } = window;
    const query = Object.fromEntries(new URL(location.href).searchParams.entries());

    return {
      ...defaultPage,
      url: location.href,
      path: location.pathname,
      query,
      search: location.search,
      referrer: document.referrer,
    };
  } catch {
    return { ...defaultPage };
  }
}

/** Returns the current browser user agent, or no value outside a browser. */
export function getUserAgent(): string | undefined {
  return typeof window === 'undefined' || typeof window.navigator === 'undefined'
    ? undefined
    : window.navigator.userAgent;
}

import { DEFAULT_PAGE_PROPERTIES, type EventBuilderConfig } from '@contentful/experiences-runtime';

type Page = ReturnType<NonNullable<EventBuilderConfig['getPageProperties']>>;
// Temporary XDA workaround: page context does not accept title, hash, width or height.
const { title: _title, ...defaultPage } = DEFAULT_PAGE_PROPERTIES;

/**
 * Keeps every value of a repeated query key, as Optimization's
 * `createQueryFromSearchParams` does: a key that appears once maps to its value.
 */
function getQuery(searchParams: URL['searchParams']): Page['query'] {
  // Object.fromEntries defines own properties, so a `__proto__` key stays a plain entry.
  return Object.fromEntries(
    Array.from(new Set(searchParams.keys()), (key) => {
      const values = searchParams.getAll(key);
      return [key, values.length === 1 ? (values[0] ?? '') : values];
    })
  );
}

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
    const query = getQuery(new URL(location.href).searchParams);

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

/*
 * `window.matchMedia` plumbing for viewport tracking, shared by every adapter.
 *
 * Each adapter owns its own reactivity primitive (React `useState`, Svelte
 * `$state`, Angular signals) but the matcher construction and the SSR guard are
 * identical, so they live here.
 *
 * "Active viewport" = the last-matching media query in the ordered viewports
 * list. With desktop-first ordering (`*`, `<992px`, `<576px`), the narrowest
 * matching query wins. With mobile-first ordering, the widest wins. Either
 * way: the last `findLastIndex` of `mediaQueryMatches[i] === true`.
 */

import type { ViewportDef } from '@contentful/experiences-sdk-core';

import { toCssMediaQuery } from './viewport';

export interface MediaQueryMatcher {
  index: number;
  signal: MediaQueryList;
}

/**
 * Builds one `MediaQueryList` per viewport that has a real media query, plus a
 * parallel array of their current match states.
 *
 * Outside the browser the matcher list comes back empty and only the wildcard
 * viewport is marked as matching, so callers stay SSR-safe without their own
 * `typeof window` guard.
 */
export function createMediaQueryMatchers(
  viewports: ViewportDef[]
): [MediaQueryMatcher[], boolean[]] {
  const mediaQueryMatches: boolean[] = new Array(viewports.length).fill(false);
  // The first viewport is the wildcard "*" and always matches.
  mediaQueryMatches[0] = true;

  const mediaQueryMatchers: MediaQueryMatcher[] = [];
  if (typeof window === 'undefined') {
    return [mediaQueryMatchers, mediaQueryMatches];
  }
  for (let index = 0; index < viewports.length; index++) {
    const viewport = viewports[index];
    if (!viewport) continue;
    const cssQuery = toCssMediaQuery(viewport);
    if (!cssQuery) continue;
    const matcher = window.matchMedia(cssQuery);
    mediaQueryMatches[index] = matcher.matches;
    mediaQueryMatchers.push({ index, signal: matcher });
  }
  return [mediaQueryMatchers, mediaQueryMatches];
}

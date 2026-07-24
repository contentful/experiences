/*
 * Reactive viewport-matcher rune.
 *
 * "Active viewport" = the last-matching media query in the ordered viewports
 * list. With desktop-first ordering (`*`, `<992px`, `<576px`), the narrowest
 * matching query wins. With mobile-first ordering, the widest wins. Either
 * way: the last `findLastIndex` of `mediaQueryMatches[i] === true`.
 *
 * Pass `initialViewportId` (typically derived from User-Agent on the server)
 * to seed the first render so SSR + client agree on viewport before
 * window.matchMedia takes over.
 */

import type { ViewportDef } from '@contentful/experiences-sdk-core';
import { getViewportIndex, toCssMediaQuery } from '@contentful/experiences-design';

export interface UseActiveViewportResult {
  readonly activeViewportIndex: number;
}

interface MediaQueryMatcher {
  index: number;
  signal: MediaQueryList;
}

function createMediaQueryMatchers(viewports: ViewportDef[]): [MediaQueryMatcher[], boolean[]] {
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

/**
 * Returns a reactive object whose `activeViewportIndex` updates as the
 * window's matched media queries change. Mounts listeners via `$effect`
 * and tears them down automatically when the calling component unmounts.
 *
 * Must be called at the top level of a `.svelte` component or a function
 * that's itself called during component setup (because of `$effect`).
 */
export function useActiveViewport(
  viewports: ViewportDef[],
  initialViewportId?: string
): UseActiveViewportResult {
  const initialIndex = getViewportIndex(viewports, initialViewportId);
  const [, initialMatches] = createMediaQueryMatchers(viewports);

  let matches = $state<boolean[]>(initialMatches);
  let activeViewportIndex = $state<number>(initialIndex);

  $effect(() => {
    const [matchers] = createMediaQueryMatchers(viewports);

    // Sync once on mount in case the initial seed was server-side.
    matches = matchers.reduce<boolean[]>(
      (acc, { index, signal }) => {
        acc[index] = signal.matches;
        return acc;
      },
      [...initialMatches]
    );

    const listeners = matchers.map(({ index, signal }) => {
      const onChange = (): void => {
        const next = [...matches];
        next[index] = signal.matches;
        matches = next;
      };
      signal.addEventListener('change', onChange);
      return onChange;
    });

    return () => {
      listeners.forEach((listener, i) => {
        const matcher = matchers[i];
        if (matcher) matcher.signal.removeEventListener('change', listener);
      });
    };
  });

  $effect(() => {
    const currentIndex = matches.findLastIndex((isMatch) => isMatch);
    if (currentIndex !== -1 && currentIndex !== activeViewportIndex) {
      activeViewportIndex = currentIndex;
    }
  });

  return {
    get activeViewportIndex() {
      return activeViewportIndex;
    },
  };
}

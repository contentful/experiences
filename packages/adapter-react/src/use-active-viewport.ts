/*
 * Reactive viewport-matcher hook.
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

'use client';

import { useEffect, useState } from 'react';

import type { ViewportDef } from '@contentful/experiences-core';
import { getViewportIndex, toCssMediaQuery } from '@contentful/experiences-design';

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

function useMediaQueryMatchers(viewports: ViewportDef[]): boolean[] {
  const [, initialMatches] = createMediaQueryMatchers(viewports);
  const [matches, setMatches] = useState<boolean[]>(initialMatches);

  useEffect(() => {
    const [matchers] = createMediaQueryMatchers(viewports);
    const listeners = matchers.map(({ index, signal }) => {
      const onChange = (): void =>
        setMatches((prev) => {
          const next = [...prev];
          next[index] = signal.matches;
          return next;
        });
      signal.addEventListener('change', onChange);
      return onChange;
    });
    return () => {
      listeners.forEach((listener, i) => {
        const matcher = matchers[i];
        if (matcher) matcher.signal.removeEventListener('change', listener);
      });
    };
  }, [viewports]);

  return matches;
}

export interface UseActiveViewportResult {
  activeViewportIndex: number;
}

export function useActiveViewport(
  viewports: ViewportDef[],
  initialViewportId?: string
): UseActiveViewportResult {
  const matches = useMediaQueryMatchers(viewports);
  const [activeViewportIndex, setActiveViewportIndex] = useState<number>(() =>
    getViewportIndex(viewports, initialViewportId)
  );

  useEffect(() => {
    const currentIndex = matches.findLastIndex((isMatch) => isMatch);
    if (currentIndex !== -1 && currentIndex !== activeViewportIndex) {
      setActiveViewportIndex(currentIndex);
    }
  }, [activeViewportIndex, matches]);

  return { activeViewportIndex };
}

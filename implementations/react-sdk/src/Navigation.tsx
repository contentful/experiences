'use client';

import { useCallback, useLayoutEffect, useState, type MouseEvent } from 'react';
import type { RuntimeFetchExperienceOptions } from '@contentful/experiences-web';

export interface PageIntent {
  url: URL;
  cycle: number;
  personalization?: RuntimeFetchExperienceOptions['personalization'];
}
export type OnIntent = (
  url: URL,
  personalization?: PageIntent['personalization'],
  history?: 'push' | 'replace' | 'none'
) => void;

export function useNavigation() {
  const [intent, setIntent] = useState<PageIntent>(() => {
    const url = new URL(window.location.href);
    return {
      url,
      cycle: 0,
      personalization:
        url.searchParams.get('userId') === 'charles'
          ? {
              events: [
                { type: 'identify', userId: 'charles', traits: { identified: true } },
                { type: 'page' },
              ],
            }
          : undefined,
    };
  });
  const onIntent = useCallback<OnIntent>((url, personalization, history = 'replace') => {
    if (history !== 'none')
      window.history[history === 'push' ? 'pushState' : 'replaceState'](
        null,
        '',
        url.pathname + url.search + url.hash
      );
    setIntent((previous) => ({ url, cycle: previous.cycle + 1, personalization }));
    if (history !== 'replace')
      window.requestAnimationFrame(() => document.getElementById('app-main')?.focus());
  }, []);
  useLayoutEffect(() => {
    const onPopState = () => onIntent(new URL(window.location.href), undefined, 'none');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [onIntent]);
  function onNavigation(event: MouseEvent<HTMLDivElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
    if (!link || link.target || link.hasAttribute('download')) return;
    const url = new URL(link.href);
    if (url.origin !== window.location.origin || !['/', '/page-two'].includes(url.pathname)) return;
    event.preventDefault();
    if (url.href !== window.location.href) onIntent(url, undefined, 'push');
  }
  return { intent, onIntent, onNavigation };
}

export function routeUrl(path: string, current: URL) {
  const url = new URL(path, current);
  for (const key of ['userId', 'preview_session_id', 'preview_experience_id']) {
    const value = current.searchParams.get(key);
    if (value !== null) url.searchParams.set(key, value);
  }
  return url.pathname + url.search;
}

export function Navigation({ url }: { url: URL }) {
  return (
    <nav className="app-nav" id="app-nav" aria-label="Main navigation">
      {['/', '/page-two'].map((path) => (
        <a
          key={path}
          href={routeUrl(path, url)}
          className={url.pathname === path ? 'active' : undefined}
          aria-current={url.pathname === path ? 'page' : undefined}
          data-testid={path === '/' ? 'link-home' : 'link-page-two'}
        >
          {path === '/' ? 'Home' : 'Page Two'}
        </a>
      ))}
    </nav>
  );
}

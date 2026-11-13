'use client';

import { useCallback, useLayoutEffect, useState, type MouseEvent } from 'react';
import type { FetchExperienceOptions } from '@contentful/experiences-web';
import type { PublicEnvironment } from '../public-config';
import { DESTINATION_NODE_ROUTE, destinationRoute, isAppRoute } from './routes';

export interface PageIntent {
  url: URL;
  cycle: number;
  personalization?: FetchExperienceOptions['personalization'];
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
    if (url.origin !== window.location.origin || !isAppRoute(url.pathname)) return;
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

export function Navigation({
  url,
  destination,
}: {
  url: URL;
  destination?: PublicEnvironment['DESTINATION'];
}) {
  const links = [
    { path: '/', label: 'Home', testId: 'link-home' },
    { path: '/page-two', label: 'Page Two', testId: 'link-page-two' },
    {
      path: destinationRoute(destination?.path ?? '/coded'),
      label: 'Destination path',
      testId: 'link-destination',
    },
    { path: DESTINATION_NODE_ROUTE, label: 'Destination node', testId: 'link-destination-node' },
  ];
  return (
    <nav className="app-nav" id="app-nav" aria-label="Main navigation">
      {links.map(({ path, label, testId }) => (
        <a
          key={path}
          href={routeUrl(path, url)}
          className={url.pathname === path ? 'active' : undefined}
          aria-current={url.pathname === path ? 'page' : undefined}
          data-testid={testId}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}

'use client';

import { useEffect, useRef, type ElementRef, type ReactNode } from 'react';
import parse from 'html-react-parser';
import { useExperiences } from '@contentful/experiences-nextjs/client';
import type { ExperiencesTrackingApi, TrackingAttribution } from '@contentful/experiences-web';

// Read only the renderer's existing event attribution. The final root scope is
// the same data supplied by React's onNodeRoot (attribution.roots.at(-1)).
export function registerManualServerViews(
  container: HTMLElement,
  tracking: Pick<ExperiencesTrackingApi, 'enableElement' | 'clearElement'>
) {
  const registered: HTMLElement[] = [];
  for (const element of container.querySelectorAll<HTMLElement>(
    '[data-reference-manual-views] [data-ctfl-scopes]'
  )) {
    const key = element.getAttribute('data-ctfl-scopes')?.trim().split(/\s+/).at(-1);
    const raw = element.closest('[data-ctfl-attribution]')?.getAttribute('data-ctfl-attribution');
    if (!key || !raw) continue;
    const { scopes } = JSON.parse(raw) as { scopes: Record<string, TrackingAttribution> };
    const data = scopes[key];
    if (!data) continue;
    tracking.enableElement('views', element, { data });
    registered.push(element);
  }
  return () => {
    for (const element of registered) tracking.clearElement('views', element);
  };
}

// App passes opaque server children; Pages passes already-rendered server HTML.
// React commits/replacements drive registration. The SDK owns all measurement.
export function ManualServerViews({ children, html }: { children?: ReactNode; html?: string }) {
  const sdk = useExperiences();
  const container = useRef<ElementRef<'div'>>(null);
  useEffect(() => {
    if (container.current) return registerManualServerViews(container.current, sdk.tracking);
  }, [sdk, children, html]);
  return <div ref={container}>{html === undefined ? children : parse(html)}</div>;
}

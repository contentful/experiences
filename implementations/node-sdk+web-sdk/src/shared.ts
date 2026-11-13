import type { URL } from 'node:url';
import type { PortableRenderPlan } from '@contentful/experiences-web';

type Node = PortableRenderPlan['nodes'][number];
export const createRoutes = (ids: string[]) => ({
  '/': { title: 'Home', automatic: ids, manual: ids.slice(0, 1) },
  '/page-two': { title: 'Page Two', automatic: ids.slice(-1), manual: ids.slice(0, 1) },
  // One Destination path (from ?path=) plus a by-node comparison; no Experience IDs.
  '/destination': { title: 'Destination', automatic: [], manual: [], destination: true },
});

// The app route that renders one Destination path. Other query intent is retained.
export function destinationHref(path: string, search = '') {
  const retained = search
    .replace(/^\?/, '')
    .split('&')
    .filter((part) => part && !part.startsWith('path='));
  return `/destination?${[`path=${encodeURIComponent(path)}`, ...retained].join('&')}`;
}

export function destinationPath(query: { get(name: string): string | null }, fallback: string) {
  const requested = query.get('path')?.trim();
  if (!requested) return fallback;
  return requested.startsWith('/') ? requested : `/${requested}`;
}

// SDK-neutral preparation only. Encoding SDK tracking attributes stays in adapters.
export function referenceNode(node: Node, identity: string, manual: boolean) {
  const roots = node.attribution?.roots ?? [];
  const manualRoot = manual ? roots.at(-1) : undefined;
  return {
    props: { ...node.props.design, ...node.props.content, ...node.props.resolved, ...node.slots },
    registered:
      (node.registration.kind === 'component' && node.registration.id === 'codedComponent') ||
      (node.registration.kind === 'experienceTemplate' &&
        node.registration.id === 'codedExperienceTemplate'),
    roots,
    manualRoot,
    clickable: roots.some((scope) => scope.entityKind === 'ExperienceFragment'),
    // E2E compatibility: inspect real rendered output; these selectors do not
    // participate in SDK interaction tracking or require a test runtime.
    attributes: {
      'data-testid': `content-${identity}`,
      'data-registration-kind': node.registration.kind,
      'data-registration-id': node.registration.id,
      ...(node.nodeId ? { 'data-node-id': node.nodeId } : {}),
      ...(manualRoot ? { 'data-reference-view-attribution': JSON.stringify(manualRoot) } : {}),
    },
  };
}

export function pageContext(url: URL, referrer: string) {
  return {
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    referrer,
    search: url.search,
    url: url.href,
  };
}

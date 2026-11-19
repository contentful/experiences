/* global $state: readonly */
import { tick } from 'svelte';

// This client-only host commits URL snapshots after its own history operations.
// The SDK receives routeKey; it does not observe or patch browser navigation.
const initialUrl = new URL(window.location.href);
let url = $state(initialUrl);
// Initial deep links may name an element that does not exist until content renders.
let scrollTarget: URL | undefined = initialUrl.hash ? initialUrl : undefined;

export const navigation = {
  get url() {
    return url;
  },
};

export function commitLocation() {
  // Browser history traversal and same-page fragments retain native scrolling.
  scrollTarget = undefined;
  if (window.location.href !== url.href) url = new URL(window.location.href);
}

export function navigate(target: URL, replace = false) {
  if (target.origin !== window.location.origin) throw new TypeError('Expected a local navigation.');
  if (target.href === window.location.href) return;
  const sameRoute = target.pathname === url.pathname && target.search === url.search;
  if (replace) window.history.replaceState(null, '', target);
  else window.history.pushState(null, '', target);
  commitLocation();
  scrollTarget = url;
  // Hash-only host changes start no content operation or resolution notification.
  if (sameRoute) void scrollAfterContentCommit(target.pathname + target.search);
}

export async function scrollAfterContentCommit(routeKey: string | undefined) {
  const target = scrollTarget;
  if (!target || routeKey !== target.pathname + target.search) return;
  await tick();
  if (scrollTarget !== target || window.location.href !== target.href) return;
  scrollTarget = undefined;
  if (!target.hash) {
    window.scrollTo(0, 0);
    return;
  }
  let id: string;
  try {
    id = decodeURIComponent(target.hash.slice(1));
  } catch {
    return;
  }
  const element = document.getElementById(id) ?? document.getElementsByName(id)[0];
  if (element) element.scrollIntoView();
  else if (id.toLowerCase() === 'top') window.scrollTo(0, 0);
}

export function handleLinkClick(event: MouseEvent) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (
    !(anchor instanceof globalThis.HTMLAnchorElement) ||
    anchor.hasAttribute('download') ||
    (anchor.target && anchor.target !== '_self') ||
    anchor.relList.contains('external')
  )
    return;
  const target = new URL(anchor.href);
  if (target.origin !== window.location.origin || !['http:', 'https:'].includes(target.protocol))
    return;
  // Leave fragment scrolling to the browser; hashchange updates metadata only.
  if (target.pathname === url.pathname && target.search === url.search && target.href.includes('#'))
    return;
  event.preventDefault();
  navigate(target);
}

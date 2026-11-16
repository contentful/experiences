import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pagesContentActionUrls } from './pages-content-action';

test('Pages server content actions keep the visible page while selecting GSSP intent', () => {
  const route = '/pages/page-two?mode=server-only&filter=a%20b&filter=c';
  for (const [action, events] of [
    ['retry', undefined],
    ['identify', [{ type: 'identify', userId: 'charles', traits: { identified: true } }]],
    ['track', [{ type: 'track', event: 'reference_custom_action' }]],
  ] as const) {
    const urls = pagesContentActionUrls(route, events ? { events: [...events] } : undefined);
    assert.equal(urls.visibleHref, route);
    const request = new URL(urls.internalHref, 'https://nextjs.invalid');
    assert.equal(request.pathname, '/pages/page-two');
    assert.equal(request.searchParams.get('action'), action);
    assert.equal(request.searchParams.get('actionRouteKey'), route);
    assert.deepEqual(request.searchParams.getAll('filter'), ['a b', 'c']);
    assert.equal(request.searchParams.get('userId'), action === 'identify' ? 'charles' : null);
  }
});

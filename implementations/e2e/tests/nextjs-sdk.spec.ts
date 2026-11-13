import { expect, test } from '@playwright/test';
import { fixture } from '../live-config';
import { observeRequests, pageEvents, requireLive, settle } from './support';

const routers = [
  { router: 'App Router', prefix: '' },
  { router: 'Pages Router', prefix: '/pages' },
] as const;
const modes = [
  { mode: 'hybrid', query: '' },
  { mode: 'ssr', query: '?mode=server-only' },
] as const;

test.describe('nextjs-sdk', () => {
  requireLive('nextjs-sdk');

  test('Experience-by-id single-experience routes still render (regression)', async ({ page }) => {
    for (const { prefix } of routers) {
      const response = await page.goto(`${prefix}/single-experience`);
      expect(response?.status()).toBe(200);
      await expect(page.getByText(fixture.coded).first()).toBeVisible();
    }
  });

  for (const { router, prefix } of routers)
    for (const { mode, query } of modes)
      test.describe(`${router}, ${mode}`, () => {
        test('loads by path with server-owned or replayed page intent only', async ({ page }) => {
          const observed = observeRequests(page);
          const response = await page.goto(`${prefix}/destination${fixture.contentPath}${query}`);
          expect(response?.status()).toBe(200);
          await expect(page.getByText(fixture.coded).first()).toBeVisible();
          await settle(page);
          const pages = pageEvents(observed);
          // No browser content fetch at startup: the server result is adopted.
          expect(observed.filter((request) => request.kind === 'xda')).toHaveLength(0);
          if (mode === 'hybrid') {
            // Server preflight, then exactly one browser replay of the evaluated page.
            expect(pages).toHaveLength(1);
            expect(pages[0]!.kind).toBe('personalization');
          } else {
            // SSR committed the page on the server; the browser adds none.
            expect(pages).toHaveLength(0);
          }
        });

        test('loads by node id', async ({ page }) => {
          const response = await page.goto(`${prefix}/destination-node${query}`);
          expect(response?.status()).toBe(200);
          await expect(page.getByText(fixture.personalized).first()).toBeVisible();
        });

        test('maps a redirect to a framework redirect', async ({ request }) => {
          const response = await request.get(
            `${prefix}/destination${fixture.redirectPath}${query}`,
            { maxRedirects: 0 }
          );
          expect([307, 308]).toContain(response.status());
          expect(response.headers().location ?? '').toContain(
            `${prefix}/destination${fixture.redirectTarget}`
          );
        });

        test('maps a missing Destination path to the normal 404', async ({ request }) => {
          const response = await request.get(`${prefix}/destination${fixture.missingPath}${query}`);
          expect(response.status()).toBe(404);
        });
      });

  test('App Router client navigation between Destination routes replays one page each', async ({
    page,
  }) => {
    await page.goto(`/destination${fixture.contentPath}`);
    await expect(page.getByText(fixture.coded).first()).toBeVisible();
    await settle(page);
    const observed = observeRequests(page);
    await page.getByRole('link', { name: `Node ${fixture.nodeId}` }).click();
    await expect(page).toHaveURL(/\/destination-node$/);
    await expect(page.getByText(fixture.personalized).first()).toBeVisible();
    await settle(page);
    expect(pageEvents(observed)).toHaveLength(1);
  });
});

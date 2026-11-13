import { expect, test } from '@playwright/test';
import { fixture } from '../live-config';
import { requireLive } from './support';

// Ordinary Node SSR: the server commits page intent; the browser runs no SDK.
test.describe('node-sdk (SSR)', () => {
  requireLive('node-sdk');

  test('Experience-by-id home still renders (regression)', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page.getByText(fixture.coded).first()).toBeVisible();
  });

  test('loads Destination content by path and by node id', async ({ page }) => {
    const response = await page.goto(
      `/destination?path=${encodeURIComponent(fixture.contentPath)}`
    );
    expect(response?.status()).toBe(200);
    await expect(page.getByText(fixture.coded).first()).toBeVisible();
    // The same route also renders the configured node.
    await expect(page.getByText(fixture.personalized).first()).toBeVisible();
    await page.goto(`/destination?path=${encodeURIComponent(fixture.personalizedPath)}`);
    await expect(page.getByText(fixture.personalized).first()).toBeVisible();
  });

  test('maps a Destination redirect to an HTTP redirect', async ({ request }) => {
    const response = await request.get(
      `/destination?path=${encodeURIComponent(fixture.redirectPath)}`,
      { maxRedirects: 0 }
    );
    expect(response.status()).toBe(302);
    expect(decodeURIComponent(response.headers().location ?? '')).toContain(
      `path=${fixture.redirectTarget}`
    );
  });

  test('maps a missing Destination path to 404', async ({ request }) => {
    const response = await request.get(
      `/destination?path=${encodeURIComponent(fixture.missingPath)}`
    );
    expect(response.status()).toBe(404);
  });
});

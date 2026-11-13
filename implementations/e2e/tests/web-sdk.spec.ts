import { expect, test } from '@playwright/test';
import { fixture } from '../live-config';
import { observeRequests, pageEvents, requireLive, settle } from './support';

// CSR: the browser's ordinary XDA fetch carries the route's page intent.
test.describe('web-sdk (CSR)', () => {
  requireLive('web-sdk');

  test('Experience-by-id home still renders (regression)', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(fixture.coded).first()).toBeVisible();
  });

  test('loads by path and by node with exactly one page event', async ({ page }) => {
    const observed = observeRequests(page);
    await page.goto(`/destination?path=${encodeURIComponent(fixture.contentPath)}`);
    await expect(page.getByText(fixture.coded).first()).toBeVisible();
    await expect(page.getByText(fixture.personalized).first()).toBeVisible();
    await settle(page);
    const pages = pageEvents(observed);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.url).toMatch(/\/destinations\/[^/]+\/experiences$/);
    // The by-node comparison fetch is event-free.
    const byNode = observed.filter((request) => /\/nodes\/[^/]+\/experiences$/.test(request.url));
    expect(byNode.length).toBeGreaterThan(0);
    expect(byNode.every((request) => request.eventTypes.length === 0)).toBe(true);
  });

  test('presents a redirect explicitly and navigates to the target route', async ({ page }) => {
    await page.goto(`/destination?path=${encodeURIComponent(fixture.redirectPath)}`);
    await expect(page).toHaveURL(new RegExp(`path=${encodeURIComponent(fixture.redirectTarget)}`));
    await expect(page.getByText(fixture.coded).first()).toBeVisible();
    await expect(page.getByText(/redirected to/i)).toBeVisible();
  });

  test('presents a missing Destination path as not found', async ({ page }) => {
    await page.goto(`/destination?path=${encodeURIComponent(fixture.missingPath)}`);
    await expect(page.getByText('Page not found')).toBeVisible();
  });
});

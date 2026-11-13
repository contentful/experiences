import { expect, test } from '@playwright/test';
import { fixture } from '../live-config';
import { observeRequests, pageEvents, requireLive, settle } from './support';

// Hybrid: the server previews (preflight) with fetchDestinationForHandoff, the browser
// replays the evaluated page exactly once and fetches no content at startup.
test.describe('node-sdk+web-sdk (hybrid)', () => {
  requireLive('node-sdk+web-sdk');

  test('Experience-by-id home keeps one replayed page (regression)', async ({ page }) => {
    const observed = observeRequests(page);
    await page.goto('/');
    await expect(page.getByText(fixture.coded).first()).toBeVisible();
    await settle(page);
    expect(pageEvents(observed)).toHaveLength(1);
  });

  test('server-renders Destination content and replays one page without browser XDA', async ({
    page,
  }) => {
    const observed = observeRequests(page);
    const response = await page.goto('/destination');
    expect(response?.status()).toBe(200);
    await expect(page.getByText(fixture.coded).first()).toBeVisible();
    await expect(page.getByText(fixture.personalized).first()).toBeVisible();
    await settle(page);
    const pages = pageEvents(observed);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.kind).toBe('personalization');
    expect(observed.filter((request) => request.kind === 'xda')).toHaveLength(0);
  });

  test('Retry is an event-free ordinary fetch', async ({ page }) => {
    await page.goto('/destination');
    await expect(page.getByText(fixture.coded).first()).toBeVisible();
    await settle(page);
    const observed = observeRequests(page);
    await page.getByRole('button', { name: 'Retry content' }).click();
    await settle(page);
    const xda = observed.filter((request) => request.kind === 'xda');
    expect(xda.length).toBeGreaterThan(0);
    expect(pageEvents(observed)).toHaveLength(0);
  });

  test('redirects at the server without a handoff', async ({ request }) => {
    const response = await request.get(
      `/destination?path=${encodeURIComponent(fixture.redirectPath)}`,
      { maxRedirects: 0 }
    );
    expect(response.status()).toBe(302);
    expect(decodeURIComponent(response.headers().location ?? '')).toContain(
      `path=${fixture.redirectTarget}`
    );
  });

  test('renders a missing Destination path as 404 and still replays its page once', async ({
    page,
  }) => {
    const observed = observeRequests(page);
    const response = await page.goto(
      `/destination?path=${encodeURIComponent(fixture.missingPath)}`
    );
    // Same as a missing by-ID Experience: 404 status, replay survives content failure.
    expect(response?.status()).toBe(404);
    await expect(page.getByText('This Destination path was not found.')).toBeVisible();
    await settle(page);
    expect(pageEvents(observed)).toHaveLength(1);
    expect(observed.filter((request) => request.kind === 'xda')).toHaveLength(0);
  });
});

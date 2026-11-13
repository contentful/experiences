import { expect, test } from '@playwright/test';
import { fixture } from '../live-config';
import { observeRequests, pageEvents, requireLive, settle } from './support';

// React managed CSR: Destination selectors on the bound Experience source.
test.describe('react-sdk (managed CSR)', () => {
  requireLive('react-sdk');

  test('Experience-by-id home still renders (regression)', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(fixture.coded).first()).toBeVisible();
  });

  test('loads by path with one page event, and Retry is event-free', async ({ page }) => {
    const observed = observeRequests(page);
    await page.goto(`/destination${fixture.contentPath}`);
    await expect(page.getByText(fixture.coded).first()).toBeVisible();
    await settle(page);
    const pages = pageEvents(observed);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.url).toMatch(/\/destinations\/[^/]+\/experiences$/);

    const retry = observeRequests(page);
    await page.getByRole('button', { name: 'Retry content' }).click();
    await settle(page);
    expect(retry.filter((request) => request.kind === 'xda').length).toBeGreaterThan(0);
    expect(pageEvents(retry)).toHaveLength(0);
    await expect(page.getByText(fixture.coded).first()).toBeVisible();
  });

  test('loads by node id', async ({ page }) => {
    const observed = observeRequests(page);
    await page.goto('/destination-node');
    await expect(page.getByText(fixture.personalized).first()).toBeVisible();
    await settle(page);
    expect(
      observed.some((request) => request.url.includes(`/nodes/${fixture.nodeId}/experiences`))
    ).toBe(true);
    expect(pageEvents(observed)).toHaveLength(1);
  });

  test('handles a redirect in app code and never renders it as content', async ({ page }) => {
    await page.goto(`/destination${fixture.redirectPath}`);
    await expect(page).toHaveURL(new RegExp(`/destination${fixture.redirectTarget}$`));
    await expect(page.getByText(fixture.coded).first()).toBeVisible();
  });

  test('presents a missing Destination path as not found', async ({ page }) => {
    await page.goto(`/destination${fixture.missingPath}`);
    await expect(page.getByText(/not found/i).first()).toBeVisible();
    await expect(page.getByText(fixture.coded)).toHaveCount(0);
  });
});

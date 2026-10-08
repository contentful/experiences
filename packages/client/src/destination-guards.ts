import { DestinationPreviewNotSupportedError } from './errors.js';

/**
 * Throws `DestinationPreviewNotSupportedError` when `clientOptions.preview` is
 * `true` and `experienceOptions` is destination-shaped (a caller-supplied
 * `{ client }` already ignores `preview` entirely, so this only fires for the
 * inline-credentials branch). Shared by `fetchExperience` and
 * `fetchDestinationSitemap` — both call into the same preview-less
 * Destinations Delivery API.
 */
export function assertDestinationPreviewSupported(
  isPreview: boolean | undefined,
  destination: { spaceId: string; destinationId: string; nodeId?: string; path?: string }
): void {
  if (!isPreview) return;

  const { spaceId, destinationId, nodeId, path } = destination;
  const locator = nodeId !== undefined ? `nodeId "${nodeId}"` : `path "${path}"`;
  throw new DestinationPreviewNotSupportedError(
    `preview: true was combined with a destination-shaped call (destinationId ` +
      `"${destinationId}", ${locator}). The Destinations Delivery API does not support ` +
      `preview mode yet — pass preview: false (or omit it) for destination-based fetches.`,
    { spaceId, destinationId, nodeId, path }
  );
}

import {
  getPreviewSessionBinding as getRuntimePreviewSessionBinding,
  type PreviewSessionBinding,
} from '@contentful/experiences-runtime/preview-session-binding';

export type { PreviewSessionBinding } from '@contentful/experiences-runtime/preview-session-binding';

/** Use current browser query parameters unless an explicit navigation target is supplied. */
export function getPreviewSessionBinding(
  defaults: Omit<PreviewSessionBinding, 'sessionId'>,
  searchParams?: URLSearchParams
): PreviewSessionBinding | undefined {
  if (searchParams === undefined) {
    if (typeof window === 'undefined') {
      throw new Error('getPreviewSessionBinding requires explicit searchParams outside a browser.');
    }
    searchParams = new URLSearchParams(window.location.search);
  }
  return getRuntimePreviewSessionBinding(defaults, searchParams);
}

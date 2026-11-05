import {
  getPreviewSessionBinding as getRuntimePreviewSessionBinding,
  type PreviewSessionBinding,
} from '@contentful/experiences-runtime/preview-session-binding';

export type { PreviewSessionBinding } from '@contentful/experiences-runtime/preview-session-binding';

/** Use current browser query parameters unless an explicit navigation target is supplied. */
export function getPreviewSessionBinding(
  defaults: Omit<PreviewSessionBinding, 'sessionId'>,
  searchParams: URLSearchParams = new URLSearchParams(window.location.search)
): PreviewSessionBinding | undefined {
  return getRuntimePreviewSessionBinding(defaults, searchParams);
}

export { getPreviewSessionBinding } from '@contentful/experiences-web/preview-session-binding';

declare const __LIVE_PREVIEW_ENABLED__: boolean;

export function loadPreviewImplementation() {
  if (!__LIVE_PREVIEW_ENABLED__)
    throw new Error(
      'Preview assets are excluded. Enable LIVE_PREVIEW_ENABLED in .env and rebuild.'
    );
  return import('@contentful/experiences-live-preview');
}

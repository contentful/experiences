import type { LivePreviewStatus } from './live-preview-client.js';

const PREVIEW_STATUS_MESSAGE = {
  source: 'experiences/live-preview',
  type: 'status',
} as const;

export function sendPreviewStatus(status: LivePreviewStatus): void {
  if (typeof window === 'undefined') return;

  window.parent?.postMessage(
    {
      ...PREVIEW_STATUS_MESSAGE,
      status,
    },
    '*'
  );
}

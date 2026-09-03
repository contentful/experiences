/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendPreviewStatus } from './preview-status';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sendPreviewStatus', () => {
  it('sends the preview status to the parent window', () => {
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);

    sendPreviewStatus('static');

    expect(postMessage).toHaveBeenCalledWith(
      {
        source: 'experiences/live-preview',
        type: 'status',
        status: 'static',
      },
      '*'
    );
  });
});

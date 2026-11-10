import { expect, it, vi } from 'vitest';
import {
  mergeNextjsLivePreview,
  resolveNextjsLivePreview,
  type NextjsLivePreviewOptions,
} from './live-preview.js';

it.each([
  [false, '?preview_session_id=a', undefined],
  [true, '', undefined],
  [true, '?preview_session_id=%20', undefined],
  [true, '?preview_session_id=%20a%20&preview_experience_id=other', 'a'],
] as const)(
  'activates only enabled nonempty URL sessions (%s, %s)',
  async (enabled, search, expected) => {
    const loadImplementation = vi.fn<NonNullable<NextjsLivePreviewOptions['loadImplementation']>>();
    const previewOptions = resolveNextjsLivePreview(
      { enabled, loadImplementation, experienceId: 'fallback' },
      '/' + search,
      'primary'
    );
    expect(loadImplementation).not.toHaveBeenCalled();
    expect(previewOptions === undefined).toBe(expected === undefined);
    if (previewOptions) {
      expect(previewOptions).toMatchObject({ experienceId: 'primary', sessionId: expected });
      await previewOptions.loadImplementation();
      expect(loadImplementation).toHaveBeenCalledOnce();
    }
  }
);

it('merges supplied preview policy over configuration while retaining the lazy client loader', () => {
  const loadImplementation = vi.fn();
  const supplied = {
    enabled: true,
    experienceId: 'primary',
    sessionHost: 'https://supplied.example',
    resourceResolution: 'resolved',
  };
  expect(
    mergeNextjsLivePreview(
      {
        enabled: false,
        experienceId: 'fallback',
        sessionHost: 'https://configured.example',
        resourceResolution: 'raw',
        loadImplementation,
      },
      supplied
    )
  ).toEqual({ ...supplied, loadImplementation });
  expect(loadImplementation).not.toHaveBeenCalled();
});

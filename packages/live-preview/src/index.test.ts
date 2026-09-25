import { describe, expect, it } from 'vitest';
import { PreviewSessionFetchError as ClientPreviewSessionFetchError } from '@contentful/experiences-client';
import { PreviewSessionFetchError } from './index.js';

describe('public Preview Session exports', () => {
  it('re-exports the Client error class by identity', () => {
    expect(PreviewSessionFetchError).toBe(ClientPreviewSessionFetchError);
    expect(
      new PreviewSessionFetchError('failed', { spaceId: 's', environmentId: 'e', sessionId: 'p' })
    ).toBeInstanceOf(ClientPreviewSessionFetchError);
  });
});

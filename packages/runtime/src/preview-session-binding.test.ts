import { describe, expect, it } from 'vitest';
import { getPreviewSessionBinding, resolvePreviewSessionId } from './preview-session-binding.js';

const defaults = {
  experienceId: 'default',
  sessionHost: 'wss://session.test',
  resourceResolution: 'resource',
};

describe('Preview Session binding', () => {
  it.each([
    ['', undefined],
    ['preview_session_id=', undefined],
    ['preview_session_id=%20%09', undefined],
    ['preview_session_id=session', { sessionId: 'session', experienceId: 'default' }],
    [
      'preview_session_id=%20session%20&preview_experience_id=%20hero%20',
      { sessionId: 'session', experienceId: 'hero' },
    ],
    [
      'preview_session_id=session&preview_experience_id=',
      { sessionId: 'session', experienceId: 'default' },
    ],
    [
      'preview_session_id=session&preview_experience_id=%20',
      { sessionId: 'session', experienceId: 'default' },
    ],
    [
      'preview_session_id=first&preview_session_id=second&preview_experience_id=hero&preview_experience_id=other',
      { sessionId: 'first', experienceId: 'hero' },
    ],
    ['preview_session_id=&preview_session_id=second', undefined],
  ])('derives the binding for %s', (query, expected) => {
    expect(getPreviewSessionBinding(defaults, new URLSearchParams(query))).toEqual(
      expected ? { ...defaults, ...expected } : undefined
    );
  });

  it.each([{}, { sessionHost: undefined, resourceResolution: undefined }])(
    'omits undefined optional fields so merging preserves existing defaults: %j',
    (optionalDefaults) => {
      const binding = getPreviewSessionBinding(
        { experienceId: 'default', ...optionalDefaults },
        new URLSearchParams('preview_session_id=session')
      );
      expect(binding).toStrictEqual({ experienceId: 'default', sessionId: 'session' });
      expect({ ...defaults, ...binding }).toStrictEqual({ ...defaults, sessionId: 'session' });
    }
  );

  it('returns independent bindings without mutating inputs or copying unrelated defaults', () => {
    const input = Object.freeze({ ...defaults, accessToken: 'private' });
    const params = new URLSearchParams('preview_session_id=session&unrelated=value');
    const original = params.toString();
    const binding = getPreviewSessionBinding(input, params)!;
    expect(binding).toEqual({ ...defaults, sessionId: 'session' });
    binding.sessionId = 'changed';
    expect(getPreviewSessionBinding(input, params)).toEqual({ ...defaults, sessionId: 'session' });
    expect(params.toString()).toBe(original);
    expect(resolvePreviewSessionId(' explicit ', params)).toBe('explicit');
    expect(resolvePreviewSessionId('', params)).toBeUndefined();
  });
});

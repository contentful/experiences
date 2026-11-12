import assert from 'node:assert/strict';
import { test } from 'node:test';
import { primaryExperience, type BrowserEnvironment } from './reference';

const environment: BrowserEnvironment = {
  web: {
    spaceId: 'space',
    environmentId: 'master',
    locale: 'en-US',
    delivery: { accessToken: 'unused' },
  },
  experienceIds: ['ordinary'],
  livePreview: { experienceId: 'configured-preview' },
};

test('active preview selects a trimmed unrestricted override and omits source maps', () => {
  const url = new URL(
    'https://reference.invalid/page-two?preview_session_id=%20session%20&preview_experience_id=%20unlisted-preview%20'
  );
  assert.deepEqual(primaryExperience(environment, url, 'route-fallback'), {
    experienceId: 'unlisted-preview',
  });
});

test('active preview uses its configured ID when the override is absent or blank', () => {
  for (const override of ['', '&preview_experience_id=', '&preview_experience_id=%20%20']) {
    const url = new URL(`https://reference.invalid/?preview_session_id=session${override}`);
    assert.deepEqual(primaryExperience(environment, url, 'default-fallback'), {
      experienceId: 'configured-preview',
    });
  }
});

test('inactive preview retains the caller fallback and ordinary source maps', () => {
  for (const [session, previewEnabled] of [
    [undefined, true],
    ['', true],
    ['   ', true],
    ['session', false],
  ] as const) {
    const url = new URL('https://reference.invalid/?preview_experience_id=unlisted-preview');
    if (session !== undefined) url.searchParams.set('preview_session_id', session);
    assert.deepEqual(
      primaryExperience(
        { ...environment, livePreview: previewEnabled ? environment.livePreview : undefined },
        url,
        'route-fallback'
      ),
      { experienceId: 'route-fallback', extensions: { sourceMap: {} } },
      `preview enabled: ${previewEnabled}; session: ${JSON.stringify(session)}`
    );
  }
});

test('active preview retains the caller fallback if no nonempty preview ID is configured', () => {
  const url = new URL('https://reference.invalid/?preview_session_id=session');
  assert.deepEqual(
    primaryExperience(
      { ...environment, livePreview: { experienceId: '' } },
      url,
      'default-fallback'
    ),
    { experienceId: 'default-fallback' }
  );
});

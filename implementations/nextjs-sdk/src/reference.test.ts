import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  destinationPathForRoute,
  destinationRedirectLocation,
  destinationRoute,
  destinationSelector,
  destinationSettings,
  experienceDescriptor,
  primaryExperience,
  referenceRequestMode,
  type BrowserEnvironment,
} from './reference';

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

const destination = destinationSettings({ DESTINATION_ID: ' destination ' })!;

test('Destination routes stay unconfigured without DESTINATION_ID', () => {
  for (const id of [undefined, '', '  '])
    assert.equal(destinationSettings({ DESTINATION_ID: id, DESTINATION_PATH: '/x' }), undefined);
});

test('Destination settings use fixture defaults, trimmed overrides and absolute paths', () => {
  assert.deepEqual(destination, {
    id: 'destination',
    path: '/coded',
    nodeId: 'sdk-ci-personalized',
    redirectPath: '/legacy',
    missingPath: '/missing',
  });
  assert.deepEqual(
    destinationSettings({
      DESTINATION_ID: 'd',
      DESTINATION_PATH: ' /personalized ',
      DESTINATION_NODE_ID: ' sdk-ci-home ',
      DESTINATION_REDIRECT_PATH: '/old',
      DESTINATION_MISSING_PATH: '/gone',
    }),
    {
      id: 'd',
      path: '/personalized',
      nodeId: 'sdk-ci-home',
      redirectPath: '/old',
      missingPath: '/gone',
    }
  );
  for (const path of ['coded', '//coded'])
    assert.throws(() => destinationSettings({ DESTINATION_ID: 'd', DESTINATION_PATH: path }));
});

test('each router maps its route remainder to a Destination path and back', () => {
  for (const [router, prefix] of [
    ['app', '/destination'],
    ['pages', '/pages/destination'],
  ] as const) {
    assert.equal(destinationPathForRoute(prefix, router), '/');
    assert.equal(destinationPathForRoute(`${prefix}/coded`, router), '/coded');
    assert.equal(destinationPathForRoute(`${prefix}-node`, router), undefined);
    assert.equal(destinationPathForRoute(`${prefix}s`, router), undefined);
    for (const path of ['/', '/coded', '/a/b'])
      assert.equal(destinationPathForRoute(destinationRoute(path, router), router), path);
  }
  assert.equal(destinationPathForRoute('/destination/coded', 'pages'), undefined);
  assert.equal(destinationRoute('/coded', 'app', true), '/destination/coded?mode=server-only');
});

test('one primary selector per request: the route path, otherwise the configured node', () => {
  const url = (path: string) => new URL(path, 'https://reference.invalid');
  assert.deepEqual(destinationSelector(destination, url('/destination/legacy'), 'app'), {
    destinationId: 'destination',
    path: '/legacy',
  });
  assert.deepEqual(destinationSelector(destination, url('/pages/destination'), 'pages'), {
    destinationId: 'destination',
    path: '/',
  });
  assert.deepEqual(destinationSelector(destination, url('/destination-node'), 'app'), {
    destinationId: 'destination',
    nodeId: 'sdk-ci-personalized',
  });
});

test('mode selection and redirect locations keep the requested rendering mode', () => {
  const url = (search: string) => new URL(`https://reference.invalid/destination${search}`);
  assert.equal(referenceRequestMode(url('')), 'hybrid');
  assert.equal(referenceRequestMode(url('?mode=server-only')), 'ssr');
  assert.equal(referenceRequestMode(url('?mode=preserve-server')), 'hybrid');
  assert.equal(
    destinationRedirectLocation('app')('/coded', { routeKey: '/destination/legacy' }),
    '/destination/coded'
  );
  assert.equal(
    destinationRedirectLocation('pages')('/', {
      routeKey: '/pages/destination/legacy?mode=server-only',
    }),
    '/pages/destination?mode=server-only'
  );
});

test('diagnostic seeds read only by-id descriptors', () => {
  const seed = (
    experience: { experienceId: string } | { destinationId: string; path: string }
  ) => ({
    requestId: 'request',
    routeKey: '/',
    experience,
  });
  assert.deepEqual(experienceDescriptor(seed({ experienceId: 'id' })), { experienceId: 'id' });
  assert.equal(experienceDescriptor(seed({ destinationId: 'd', path: '/' })), undefined);
  assert.equal(experienceDescriptor(undefined), undefined);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getPublicEnvironment } from '../public-config.ts';
import {
  DESTINATION_NODE_ROUTE,
  destinationPathForRoute,
  destinationRoute,
  isAppRoute,
} from './routes.ts';

test('maps application routes under /destination to absolute Destination paths', () => {
  assert.equal(destinationPathForRoute('/destination'), '/');
  assert.equal(destinationPathForRoute('/destination/'), '/');
  assert.equal(destinationPathForRoute('/destination/getting-started'), '/getting-started');
  assert.equal(destinationPathForRoute('/destination/a/b'), '/a/b');
  for (const pathname of ['/', '/page-two', '/destinations', '/destination-node', '/x/destination'])
    assert.equal(destinationPathForRoute(pathname), undefined, pathname);
});

test('maps Destination paths, including redirect targets, back to application routes', () => {
  assert.equal(destinationRoute('/'), '/destination');
  assert.equal(destinationRoute('/getting-started'), '/destination/getting-started');
  for (const path of ['/', '/getting-started', '/quick-start', '/a/b'])
    assert.equal(destinationPathForRoute(destinationRoute(path)), path);
});

test('handles only reference routes in the browser', () => {
  for (const pathname of ['/', '/page-two', '/destination', '/destination/retired-page'])
    assert.equal(isAppRoute(pathname), true, pathname);
  assert.equal(isAppRoute(DESTINATION_NODE_ROUTE), true);
  for (const pathname of ['/health', '/assets/app.js', '/destinations', '/page-three'])
    assert.equal(isAppRoute(pathname), false, pathname);
});

test('leaves Destination routes unconfigured without DESTINATION_ID', () => {
  for (const id of [undefined, '', '   ']) {
    const environment = getPublicEnvironment({ DESTINATION_ID: id, DESTINATION_PATH: '/x' });
    assert.equal(environment.DESTINATION, undefined);
    assert.equal(environment.EXPERIENCE_IDS.length, 3);
  }
});

test('projects the Destination allowlist with fixture defaults and trimmed overrides', () => {
  assert.deepEqual(getPublicEnvironment({ DESTINATION_ID: ' destination ' }).DESTINATION, {
    id: 'destination',
    path: '/getting-started',
    nodeId: 'spring-offers',
    redirectPath: '/quick-start',
    missingPath: '/retired-page',
  });
  assert.deepEqual(
    getPublicEnvironment({
      DESTINATION_ID: 'destination',
      DESTINATION_PATH: ' /spring-offers ',
      DESTINATION_NODE_ID: ' home ',
      DESTINATION_REDIRECT_PATH: '/old',
      DESTINATION_MISSING_PATH: '/gone',
    }).DESTINATION,
    {
      id: 'destination',
      path: '/spring-offers',
      nodeId: 'home',
      redirectPath: '/old',
      missingPath: '/gone',
    }
  );
  for (const path of ['coded', '//getting-started'])
    assert.throws(
      () => getPublicEnvironment({ DESTINATION_ID: 'destination', DESTINATION_PATH: path }),
      /absolute/
    );
});

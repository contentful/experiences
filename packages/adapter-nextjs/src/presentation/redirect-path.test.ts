import { expect, it } from 'vitest';
import { localRedirectPath } from './redirect-path.js';

it.each(['/', '/target?from=source#content', '/%2f%2fexample.com', '/a/../target'])(
  'retains a local redirect unchanged: %s',
  (path) => expect(localRedirectPath(path)).toBe(path)
);

it.each([
  undefined,
  null,
  '',
  'target',
  'https://example.com/x',
  '//example.com',
  '/.//example.com',
  '/a/..//example.com',
  '/%2e//example.com',
  'javascript:alert(1)',
  '/\\example.com',
  '/local\\path',
  '/\n/example.com',
  '/\r/example.com',
  '/\t/example.com',
  '/local\npath',
])('rejects unsafe redirect syntax: %j', (path) => {
  expect(() => localRedirectPath(path as string)).toThrow(TypeError);
});

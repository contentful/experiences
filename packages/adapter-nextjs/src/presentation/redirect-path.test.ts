import { expect, it } from 'vitest';
import { getRedirectError } from './redirect-path.js';

it.each([
  '/',
  '/target?from=source#content',
  '/%2f%2fexample.com',
  '/%5Cexample.com',
  '/a/../target',
])('accepts a local redirect: %s', (path) => expect(getRedirectError(path)).toBeUndefined());

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
  expect(getRedirectError(path as string)).toEqual(
    new TypeError('Destination redirect must be a local absolute path.')
  );
});

import { expect, it } from 'vitest';
import { serializeRequestResult } from './server-config.js';

it.each([{ redirect: { path: '/target' } }, { notFound: true as const }])(
  'retains payload identity and projects routing outcome %j',
  (outcome) => {
    const projected = serializeRequestResult({
      requestId: 'request',
      routeKey: '/source?q=1',
      experience: { destinationId: 'site', path: '/source' },
      ...outcome,
      error: new Error('private'),
    });
    expect(projected).toEqual({
      requestId: 'request',
      routeKey: '/source?q=1',
      experience: { destinationId: 'site', path: '/source' },
      ...outcome,
    });
  }
);

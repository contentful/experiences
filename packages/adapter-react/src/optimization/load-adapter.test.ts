import { describe, expect, it } from 'vitest';

import { adapterFactory } from './load-adapter';

describe('load-adapter', () => {
  // The workspace has the optional peer `@contentful/optimization-react-web`
  // installed for the Milestone 13 smoke app in `examples/nextjs`. When the
  // peer resolves, `adapterFactory` is the real `getExperiencesAdapter`
  // function; when it doesn't, it stays `null` so the flag degrades to a
  // no-op. We only ever expect one of the two states — never a partial one.
  it('resolves adapterFactory to a function or null (never partially initialized)', () => {
    if (adapterFactory === null) {
      expect(adapterFactory).toBeNull();
    } else {
      expect(typeof adapterFactory).toBe('function');
    }
  });
});

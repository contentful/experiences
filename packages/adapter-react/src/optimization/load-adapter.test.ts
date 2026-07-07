import { describe, expect, it } from 'vitest';

import { adapterFactory } from './load-adapter';

describe('load-adapter', () => {
  it('resolves to null when the optional peer @contentful/optimization-react-web is not installed', () => {
    expect(adapterFactory).toBeNull();
  });
});

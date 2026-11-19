import { describe, expect, it } from 'vitest';
import { mergeResolveOptions } from './resolve-options.js';

const config = { components: {} };
describe('request resolve options', () => {
  it('applies method metadata and explicit false after request options', () => {
    expect(
      mergeResolveOptions(
        { debug: true, metadata: { request: 'value', shared: 'request' } },
        { config, debug: false, metadata: { method: 'value', shared: 'method' } }
      )
    ).toEqual({
      config,
      debug: false,
      metadata: { request: 'value', method: 'value', shared: 'method' },
      sourceMap: undefined,
    });
  });

  it('retains request sourceMap unless the method supplies one', () => {
    const requestMap = { version: 1 } as never;
    const methodMap = { version: 2 } as never;
    expect(mergeResolveOptions({ sourceMap: requestMap }, { config })).toMatchObject({
      sourceMap: requestMap,
    });
    expect(
      mergeResolveOptions({ sourceMap: requestMap }, { config, sourceMap: methodMap })
    ).toMatchObject({ sourceMap: methodMap });
  });
});

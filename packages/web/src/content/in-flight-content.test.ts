import { describe, expect, it, vi } from 'vitest';
import { resolveExperience } from '@contentful/experiences-sdk-core';
import { InFlightContent } from './in-flight-content.js';
import { deferred } from '../test/dom.js';

describe('InFlightContent', () => {
  it('shares equivalent pending work and detaches content and Error descriptors for every caller', async () => {
    const sharing = new InFlightContent();
    const resolverError = new Error('resolver failed', { cause: () => {} });
    const resolve = {
      config: {
        components: {
          Heading: {
            resolveData: () => {
              throw resolverError;
            },
          },
        },
      },
    };
    const source = await resolveExperience(
      {
        nodes: [
          {
            component: {
              sys: {
                type: 'ResourceLink',
                linkType: 'Contentful:Component',
                urn: 'crn:contentful:::experience:spaces/$self/environments/$self/components/Heading',
              },
            },
            contentProperties: { text: 'original' },
          },
        ],
      },
      resolve.config
    );
    const load = vi.fn(async () => source);
    const [first, second] = await Promise.all([
      sharing.share('same', resolve, load),
      sharing.share('same', resolve, load),
    ]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.diagnostics[0]).toBeInstanceOf(Error);
    expect(first.diagnostics[0]!.cause).toBe(resolverError);
    expect(first.diagnostics[0]!.stack).toBe(source.diagnostics[0]!.stack);
    first.diagnostics[0]!.message = 'changed';
    expect(second.diagnostics[0]!.message).toBe(source.diagnostics[0]!.message);
    first.nodes[0]!.props.content.text = 'changed';
    expect(second.nodes[0]!.props.content.text).toBe('original');
    expect(source.nodes[0]!.props.content.text).toBe('original');
    first.nodes.splice(0, 1);
    expect(second.nodes).toHaveLength(1);
    expect(source.nodes).toHaveLength(1);
    await sharing.share('same', resolve, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not share a request without a source key, including its returned Promise', () => {
    const sharing = new InFlightContent(),
      resolve = { config: { components: {} } };
    const pending = deferred<{ redirect: { path: string } }>(),
      load = vi.fn(() => pending.promise);
    expect(sharing.share(undefined, resolve, load)).toBe(pending.promise);
    expect(sharing.share(undefined, resolve, load)).toBe(pending.promise);
    expect(load).toHaveBeenCalledTimes(2);
    pending.resolve({ redirect: { path: '/next' } });
  });

  it('separates resolver registries and source keys and releases failed work for retry', async () => {
    const sharing = new InFlightContent(),
      first = { config: { components: {} } },
      second = { config: { components: {} } };
    const failure = new Error('request failed'),
      pending = deferred<{ redirect: { path: string } }>();
    const load = vi.fn(() => pending.promise);
    const a = sharing.share('a', first, load),
      b = sharing.share('a', first, load);
    const otherRegistry = sharing.share('a', second, load),
      otherKey = sharing.share('b', first, load);
    expect(load).toHaveBeenCalledTimes(3);
    pending.reject(failure);
    for (const result of [a, b, otherRegistry, otherKey])
      await expect(result).rejects.toBe(failure);
    load.mockResolvedValue({ redirect: { path: '/retry' } });
    await expect(sharing.share('a', first, load)).resolves.toEqual({
      redirect: { path: '/retry' },
    });
    expect(load).toHaveBeenCalledTimes(4);
  });

  it('keeps a replacement pending load when work from before clear settles', async () => {
    const sharing = new InFlightContent(),
      resolve = { config: { components: {} } };
    const old = deferred<{ redirect: { path: string } }>(),
      next = deferred<{ redirect: { path: string } }>();
    const load = vi.fn().mockReturnValueOnce(old.promise).mockReturnValue(next.promise);
    const first = sharing.share('same', resolve, load);
    sharing.clear();
    const second = sharing.share('same', resolve, load);
    old.resolve({ redirect: { path: '/old' } });
    await first;
    const third = sharing.share('same', resolve, load);
    expect(load).toHaveBeenCalledTimes(2);
    next.resolve({ redirect: { path: '/next' } });
    expect(await second).toEqual(await third);
  });
});

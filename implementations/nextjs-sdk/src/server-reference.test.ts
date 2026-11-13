import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { ContentfulExperiences, type PortableRenderPlan } from '@contentful/experiences-node';

type FetchOptions = Parameters<ContentfulExperiences['fetchExperience']>[0];
const ids = ['primary', 'comparison'];
let sdk: ContentfulExperiences;
mock.module(new URL('./config.ts', import.meta.url).href, {
  namedExports: { getServer: () => ({ sdk, browser: { experienceIds: ids } }) },
});
const { loadComparisons } = await import('./server-reference');

test('comparisons omit primary identity, retain preview/preflight policy and dispose their request', async (t) => {
  for (const [isPreview, preflight] of [
    [false, true],
    [true, false],
  ] as const) {
    const calls: FetchOptions[] = [];
    sdk = new ContentfulExperiences({
      spaceId: 'space',
      environmentId: 'master',
      delivery: { accessToken: 'unused' },
    });
    const plan: PortableRenderPlan = { nodes: [], diagnostics: [], metadata: {}, debug: false };
    t.mock.method(sdk, 'fetchExperience', async (options: FetchOptions) => {
      calls.push(options);
      return plan;
    });
    const primary = sdk.forRequest({
      profile: { id: 'provisional-primary' },
      locale: 'de-DE',
      isPreview,
    });
    const initialProfile = primary.profile;
    const factory = t.mock.method(sdk, 'forRequest');
    const comparisons = await loadComparisons(
      primary,
      { experienceId: ids[0] },
      new URL('https://reference.invalid/?mode=server-only'),
      preflight
    );
    assert.deepEqual(comparisons, [{ experienceId: ids[1], plan }]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.personalization, undefined);
    assert.equal(calls[0]!.locale, 'de-DE');
    assert.deepEqual(calls[0]!.extensions, isPreview ? undefined : { sourceMap: {} });
    assert.deepEqual(primary.profile, initialProfile);
    assert.equal(factory.mock.calls.length, 1);
    assert.equal(factory.mock.calls[0]!.arguments[0]?.isPreview, isPreview);
    assert.equal(factory.mock.calls[0]!.arguments[0]?.preflight, preflight);
    await assert.rejects(
      factory.mock.calls[0]!.result!.fetchExperience(
        { experienceId: ids[1] },
        { config: { components: {} } }
      ),
      /destroyed/
    );
    primary.destroy();
  }
});

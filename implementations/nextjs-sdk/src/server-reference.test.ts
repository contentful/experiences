import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { ContentfulExperiences, type PortableRenderPlan } from '@contentful/experiences-node';

type FetchOptions = Parameters<ContentfulExperiences['fetchExperience']>[0];
const ids = ['primary', 'comparison'];
let sdk: ContentfulExperiences;
mock.module(new URL('./config.ts', import.meta.url).href, {
  namedExports: {
    getServer: () => ({
      sdk,
      browser: {
        experienceIds: ids,
        ...(sdk.config.preview ? { livePreview: { experienceId: ids[0] } } : {}),
      },
    }),
  },
});
const { loadComparisons } = await import('./server-reference');

test('comparisons omit primary identity, retain preview/preflight policy and dispose their request', async (t) => {
  for (const [isPreview, preflight] of [
    [false, true],
    [true, false],
  ] as const) {
    const calls: FetchOptions[] = [];
    const fetchPreview = t.mock.fn(async () =>
      globalThis.Response.json({ sys: { id: ids[0], type: 'Experience' }, nodes: [] })
    );
    sdk = new ContentfulExperiences({
      spaceId: 'space',
      environmentId: 'master',
      delivery: { accessToken: 'unused' },
      ...(isPreview ? { preview: { accessToken: 'unused-preview', fetch: fetchPreview } } : {}),
    });
    const plan: PortableRenderPlan = { nodes: [], diagnostics: [], metadata: {}, debug: false };
    t.mock.method(sdk, 'fetchExperience', async (options: FetchOptions) => {
      calls.push(options);
      return plan;
    });
    const primary = sdk.forRequest({
      profile: { id: 'provisional-primary' },
      locale: 'de-DE',
      ...(isPreview ? { preview: { sessionId: 'session' } } : {}),
    });
    assert.equal(primary.isPreview, isPreview);
    const initialProfile = primary.profile;
    const factory = t.mock.method(sdk, 'forRequest');
    const comparisons = await loadComparisons(
      primary,
      { experienceId: ids[0] },
      new URL(
        `https://reference.invalid/?mode=server-only${isPreview ? '&preview_session_id=session' : ''}`
      ),
      preflight
    );
    assert.deepEqual(comparisons, [{ experienceId: ids[1], plan }]);
    assert.equal(fetchPreview.mock.calls.length, isPreview ? 1 : 0);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.personalization, undefined);
    assert.equal(calls[0]!.locale, 'de-DE');
    assert.deepEqual(calls[0]!.extensions, isPreview ? undefined : { sourceMap: {} });
    assert.deepEqual(primary.profile, initialProfile);
    assert.equal(factory.mock.calls.length, 1);
    assert.equal(factory.mock.calls[0]!.result!.isPreview, isPreview);
    assert.equal(
      factory.mock.calls[0]!.arguments[0]?.preview?.sessionId,
      isPreview ? 'session' : undefined
    );
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

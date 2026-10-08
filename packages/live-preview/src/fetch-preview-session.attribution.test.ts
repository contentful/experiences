/*
 * Attribution across Preview Session updates. Uses the real core resolver (the
 * sibling test mocks it): a Live Preview update is just another
 * `fetchPreviewSession`, so each one must replace or clear the previous
 * attribution, and must do so without adding a diagnostic (which would make the
 * hooks drop the plan).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchPreviewSession } from './fetch-preview-session.js';

const { mockClient, mockCreateClient } = vi.hoisted(() => ({
  mockClient: { fetch: vi.fn() },
  mockCreateClient: vi.fn(),
}));

vi.mock('@contentful/experiences-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@contentful/experiences-client')>()),
  createClient: mockCreateClient,
}));

const experienceOptions = { spaceId: 'space-1', environmentId: 'master', sessionId: 'session-1' };
const resolveOptions = { config: { components: {} } };

const sourceMap = (experienceId: string) => ({
  version: 1,
  variants: [{ type: 'personalization', id: 'default' }],
  spaces: [],
  environments: [],
  locales: [],
  entries: [],
  assets: [],
  layers: [
    { kind: 'Experience', id: experienceId, variants: [0] },
    { kind: 'Component', id: 'hero' },
  ],
  dataAssemblies: [],
  nodes: { n: { layers: [1, 0], scope: 0, contentProperties: [] } },
});

const payload = (map?: unknown) => ({
  sys: { type: 'Experience' },
  nodes: [
    {
      id: 'n',
      component: {
        sys: {
          type: 'ResourceLink',
          linkType: 'Contentful:Component',
          urn: 'crn:contentful:::experience:spaces/$self/environments/$self/components/hero',
        },
      },
    },
  ],
  ...(map === undefined ? {} : { extensions: { sourceMap: map } }),
});

const respond = (body: unknown) => new globalThis.Response(JSON.stringify(body), { status: 200 });

const fetchPlan = () =>
  fetchPreviewSession(experienceOptions, { previewToken: 'preview-token' }, resolveOptions);

describe('fetchPreviewSession attribution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClient.mockReturnValue(mockClient);
  });

  it('attributes a session response that carries a source map', async () => {
    mockClient.fetch.mockResolvedValue(respond(payload(sourceMap('exp-a'))));

    const plan = await fetchPlan();

    expect(plan.nodes[0]!.attribution!.scopes.map((s) => s.entityId)).toEqual(['exp-a']);
    expect(plan.diagnostics).toEqual([]);
  });

  it('replaces attribution on the next update, even with a reused node id', async () => {
    mockClient.fetch.mockResolvedValueOnce(respond(payload(sourceMap('exp-a'))));
    mockClient.fetch.mockResolvedValueOnce(respond(payload(sourceMap('exp-b'))));

    const first = await fetchPlan();
    const second = await fetchPlan();

    expect(first.nodes[0]!.nodeId).toBe(second.nodes[0]!.nodeId);
    expect(first.nodes[0]!.attribution!.scopes[0]!.entityId).toBe('exp-a');
    expect(second.nodes[0]!.attribution!.scopes[0]!.entityId).toBe('exp-b');
  });

  it('clears attribution when an update carries no source map', async () => {
    mockClient.fetch.mockResolvedValueOnce(respond(payload(sourceMap('exp-a'))));
    mockClient.fetch.mockResolvedValueOnce(respond(payload()));

    await fetchPlan();
    const cleared = await fetchPlan();

    expect(cleared.attribution).toBeUndefined();
    expect(cleared.nodes[0]).not.toHaveProperty('attribution');
  });

  it('leaves attribution absent, without a diagnostic, for an unusable map', async () => {
    mockClient.fetch.mockResolvedValue(respond(payload({ ...sourceMap('exp-a'), version: 99 })));

    const plan = await fetchPlan();

    expect(plan.attribution).toBeUndefined();
    expect(plan.nodes[0]).not.toHaveProperty('attribution');
    // A diagnostic would make useExperiencePlan drop the whole update.
    expect(plan.diagnostics).toEqual([]);
  });
});

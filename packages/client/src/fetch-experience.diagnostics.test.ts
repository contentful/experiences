import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentfulViewDelivery } from '@contentful/experience-delivery';
import { fetchExperience, type ExperienceOptions } from './fetch-experience.js';
import { ExperienceFetchError } from './errors.js';

const { get, getWithOverrides, resolveByNodeId, resolveByPath } = vi.hoisted(() => ({
  get: vi.fn(),
  getWithOverrides: vi.fn(),
  resolveByNodeId: vi.fn(),
  resolveByPath: vi.fn(),
}));

// Keep Core real: these cases cover Client conversion and Core normalization together.
vi.mock('@contentful/experience-delivery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@contentful/experience-delivery')>();
  return {
    ...actual,
    ContentfulViewDeliveryClient: vi.fn().mockImplementation(() => ({
      experience: { get, getWithOverrides },
      destination: { resolveByNodeId, resolveByPath },
    })),
  };
});

const byId = { spaceId: 'space', environmentId: 'master', experienceId: 'experience' };
const destination = { spaceId: 'space', destinationId: 'destination' };
const clientOptions = { accessToken: 'token' };
const resolveOptions = { config: { components: { heading: {} } } };
const diagnostics = [
  { fieldPath: 'nodes[0].contentProperties.image', message: 'Image unavailable' },
  { fieldPath: 'nodes[0].contentProperties.link', message: 'Link unavailable' },
];

function payload(
  errors: unknown = diagnostics.map((diagnostic) => ({
    ...diagnostic,
    originalError: { private: 'upstream details' },
    additionalField: 'not public',
  }))
) {
  return {
    sys: { id: 'experience' },
    nodes: [
      {
        id: 'title',
        component: {
          sys: {
            type: 'ResourceLink',
            linkType: 'Contentful:Component',
            urn: 'crn:contentful:::experience:spaces/space/environments/master/components/heading',
          },
        },
        contentProperties: { text: 'Still renderable' },
        designProperties: {},
      },
    ],
    errors,
    extensions: { personalization: { profile: { id: 'profile' } } },
  };
}

const routes: {
  name: string;
  options: ExperienceOptions;
  delivery: typeof get;
  destination: boolean;
}[] = [
  { name: 'by-ID GET', options: byId, delivery: get, destination: false },
  {
    name: 'by-ID POST',
    options: { ...byId, extensions: { sourceMap: {} } },
    delivery: getWithOverrides,
    destination: false,
  },
  {
    name: 'destination node',
    options: { ...destination, nodeId: 'node' },
    delivery: resolveByNodeId,
    destination: true,
  },
  {
    name: 'destination path',
    options: { ...destination, path: '/' },
    delivery: resolveByPath,
    destination: true,
  },
];

function fetchRoute(options: ExperienceOptions) {
  if ('nodeId' in options) return fetchExperience(options, clientOptions, resolveOptions);
  if ('path' in options) return fetchExperience(options, clientOptions, resolveOptions);
  return fetchExperience(options, clientOptions, resolveOptions);
}

beforeEach(() => {
  get.mockReset();
  getWithOverrides.mockReset();
  resolveByNodeId.mockReset();
  resolveByPath.mockReset();
});

describe.each(routes)('fetchExperience diagnostics — $name', (route) => {
  function respond(response: ReturnType<typeof payload>) {
    route.delivery.mockResolvedValue(
      route.destination ? { experiences: [{ path: '/', experience: response }] } : response
    );
  }

  async function fetchPlan() {
    const plan = await fetchRoute(route.options);
    if ('redirect' in plan) throw new Error('Expected a render plan');
    return plan;
  }

  it('projects ordered public diagnostics while preserving useful content and profile', async () => {
    const response = payload();
    respond(response);

    const plan = await fetchPlan();

    expect(route.delivery).toHaveBeenCalledTimes(1);
    expect(plan.deliveryDiagnostics).toEqual(diagnostics);
    expect(plan.deliveryDiagnostics).not.toBe(response.errors);
    expect(plan.deliveryDiagnostics?.[0]).not.toBe((response.errors as unknown[])[0]);
    expect(JSON.parse(JSON.stringify(plan)).deliveryDiagnostics).toEqual(diagnostics);
    expect(plan.nodes[0]?.props.content).toEqual({ text: 'Still renderable' });
    expect(plan.personalization).toEqual({ profileId: 'profile' });
    expect(plan.diagnostics).toEqual([]);
  });

  it.each([{ errors: [] }, { errors: [{ unsupported: true }] }, { errors: undefined }])(
    'omits the optional field when no errors are recognized ($errors)',
    async ({ errors }) => {
      // Assign explicitly because payload() otherwise supplies its diagnostic defaults.
      const response = { ...payload(), errors };
      respond(response);

      const plan = await fetchPlan();

      expect(plan).not.toHaveProperty('deliveryDiagnostics');
      expect(plan.nodes[0]?.props.content.text).toBe('Still renderable');
      expect(plan.personalization?.profileId).toBe('profile');
    }
  );

  it('preserves Delivery 404 control flow', async () => {
    const error = new ContentfulViewDelivery.NotFoundError({ message: 'Not found' });
    route.delivery.mockRejectedValue(error);

    await expect(fetchPlan()).rejects.toBe(error);
  });

  it('preserves transport failure wrapping and cause', async () => {
    const error = new Error('Connection closed');
    route.delivery.mockRejectedValue(error);

    const rejection: unknown = await fetchPlan().catch((reason) => reason);

    expect(rejection).toBeInstanceOf(ExperienceFetchError);
    expect((rejection as ExperienceFetchError).cause).toBe(error);
  });
});

describe.each(routes.filter((route) => route.destination))(
  'fetchExperience redirect — $name',
  (route) => {
    it('returns destination redirects unchanged', async () => {
      route.delivery.mockResolvedValue({ redirect: { path: '/canonical' } });

      await expect(fetchRoute(route.options)).resolves.toEqual({
        redirect: { path: '/canonical' },
      });
    });
  }
);

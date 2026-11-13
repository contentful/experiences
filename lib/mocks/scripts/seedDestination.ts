/*
 * Explicit maintenance tool: create or update the reference-implementation
 * Destination in the space configured by the ignored `.contentfulrc.json`.
 *
 * It writes to Contentful. Run it only when a space mutation is authorized, through
 * `npm run seed:ctfl:destination` (inline `y` confirmation) or the `:confirmed`
 * script. It is never part of install, typecheck, lint or tests.
 *
 * The Channel/Destination/node requests follow `examples/scripts/bootstrap-example.ts`.
 * The plain management client has no Destination methods, so this uses raw CMA fetches.
 * Every resource is upserted by a stable id (or, for the server-generated Destination
 * id, by name), so re-running converges on the same fixture.
 */
/* global fetch, RequestInit */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type NodeFixture = { id: string; path: string } & (
  { kind: 'experience'; experienceId: string } | { kind: 'redirect'; redirectToNodeId: string }
);

/**
 * Reference-implementation fixture. Paths are single segments joined to `/` by the
 * API; the empty path is the Destination home `/`. The Experience ids are the
 * implementations' hard-coded defaults. `/retired-page` and node `retired-page` are
 * intentionally absent so references can exercise not-found handling.
 */
export const destinationFixture = {
  channel: {
    id: 'experiences-sdk-reference-site',
    name: 'Experiences SDK Reference Site',
    description: 'Website routing model for the Experiences SDK reference applications',
    properties: [],
    nodeProperties: [{ name: 'Path', type: 'Path' }],
  },
  destination: {
    name: 'Experiences SDK Reference Site',
    description:
      'Reference site pages: a home page, a getting-started guide, a personalized spring offers page and a moved quick-start page',
    properties: [],
  },
  nodes: [
    // Home page: the Composed Experience.
    { id: 'home', kind: 'experience', path: '', experienceId: '4WzbgzPQHa9Tr2ffbOU8p7' },
    // Getting-started guide: the Coded Experience.
    {
      id: 'getting-started',
      kind: 'experience',
      path: 'getting-started',
      experienceId: '3fLAdFb3BYAuImRhcW8k4t',
    },
    // Spring offers: the Personalized Composed Experience.
    {
      id: 'spring-offers',
      kind: 'experience',
      path: 'spring-offers',
      experienceId: '7u2eP09B4BIBToH8UwSHck',
    },
    // The old quick-start URL moved: `/quick-start` resolves to
    // `{ redirect: { path: '/getting-started' } }`.
    {
      id: 'quick-start',
      kind: 'redirect',
      path: 'quick-start',
      redirectToNodeId: 'getting-started',
    },
  ] satisfies NodeFixture[],
};

type Versioned = { sys: { id: string; version: number; publishedVersion?: number } };

const API_BASE = 'https://api.contentful.com';
const here = dirname(fileURLToPath(import.meta.url));
const rc = JSON.parse(readFileSync(resolve(here, '../.contentfulrc.json'), 'utf8')) as {
  managementToken?: string;
  spaceId?: string;
  environmentId?: string;
};
const { managementToken, spaceId, environmentId } = rc;
if (!managementToken || !spaceId || !environmentId)
  throw new Error('.contentfulrc.json requires managementToken, spaceId and environmentId.');
const CMA_BASE = `${API_BASE}/spaces/${spaceId}/environments/${environmentId}`;

async function rawJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${managementToken}`,
      'Content-Type': 'application/vnd.contentful.management.v1+json',
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok)
    throw new Error(
      `${init.method ?? 'GET'} ${url} failed (${response.status}): ${await response.text()}`
    );
  return (await response.json()) as T;
}

async function getOptional<T>(url: string): Promise<T | undefined> {
  try {
    return await rawJson<T>(url);
  } catch (error) {
    if (String(error).includes('(404)')) return undefined;
    throw error;
  }
}

const isPublished = (resource: Versioned) =>
  !!resource.sys.publishedVersion && resource.sys.publishedVersion === resource.sys.version;

async function publish(url: string, resource: Versioned): Promise<void> {
  if (isPublished(resource)) return;
  await rawJson(`${url}/published`, {
    method: 'PUT',
    headers: { 'X-Contentful-Version': String(resource.sys.version) },
  });
}

async function upsert(url: string, body: unknown): Promise<Versioned> {
  const existing = await getOptional<Versioned>(url);
  return rawJson<Versioned>(url, {
    method: 'PUT',
    headers: existing ? { 'X-Contentful-Version': String(existing.sys.version) } : {},
    body: JSON.stringify(body),
  });
}

async function seedChannel(): Promise<void> {
  const space = await rawJson<{ sys: { organization?: { sys: { id: string } } } }>(
    `${API_BASE}/spaces/${spaceId}`
  );
  const organizationId = space.sys.organization?.sys.id;
  if (!organizationId) throw new Error('Channels are organization-scoped; no organization id.');
  const { id, ...body } = destinationFixture.channel;
  const url = `${API_BASE}/organizations/${organizationId}/channels/${id}`;
  await publish(url, await upsert(url, body));
  console.warn(`Channel "${id}" published`);
}

async function seedDestination(): Promise<string> {
  const base = `${CMA_BASE}/destinations`;
  const { channel, destination } = destinationFixture;
  const list = await rawJson<{ items: (Versioned & { name: string })[] }>(`${base}?limit=100`);
  const existing = list.items.find((item) => item.name === destination.name);
  // channelId is fixed on create and must not be sent on update.
  const current = existing
    ? await rawJson<Versioned>(`${base}/${existing.sys.id}`, {
        method: 'PUT',
        headers: { 'X-Contentful-Version': String(existing.sys.version) },
        body: JSON.stringify(destination),
      })
    : await rawJson<Versioned>(base, {
        method: 'POST',
        body: JSON.stringify({ ...destination, channelId: channel.id }),
      });
  await publish(`${base}/${current.sys.id}`, current);
  console.warn(`Destination "${destination.name}" published (${current.sys.id})`);
  return current.sys.id;
}

function nodeBody(node: NodeFixture, destinationId: string): Record<string, unknown> {
  // The upsert validator discriminates on a top-level `type`; see the examples bootstrap.
  const body: Record<string, unknown> = {
    type: node.kind === 'experience' ? 'DestinationExperienceNode' : 'DestinationRedirectNode',
    properties: [{ path: node.path }],
    parent: { sys: { type: 'Link', linkType: 'Destination', id: destinationId } },
  };
  if (node.kind === 'experience')
    body.experience = {
      sys: {
        type: 'ResourceLink',
        linkType: 'Contentful:Experience',
        urn: `crn:contentful:::experience:spaces/$self/environments/$self/experiences/${node.experienceId}`,
      },
    };
  else
    body.redirectTo = {
      sys: { type: 'Link', linkType: 'DestinationExperienceNode', id: node.redirectToNodeId },
    };
  return body;
}

async function main(): Promise<void> {
  console.warn(`Seeding the reference Destination into ${spaceId}/${environmentId}`);
  await seedChannel();
  const destinationId = await seedDestination();
  // Order matters: a redirect target must exist before the redirect.
  for (const node of destinationFixture.nodes) {
    const url = `${CMA_BASE}/destinations/${destinationId}/nodes/${node.id}`;
    await publish(url, await upsert(url, nodeBody(node, destinationId)));
    console.warn(`${node.kind} node "${node.id}" (/${node.path}) published`);
  }
  console.warn(
    `\nSet DESTINATION_ID=${destinationId} in each reference implementation's local .env.`
  );
}

await main();

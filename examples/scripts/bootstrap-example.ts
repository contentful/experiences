/**
 * Bootstrap the ExO example into a caller-specified Contentful space/environment.
 *
 * Reads SPACE_ID / ENVIRONMENT_ID / CMA_TOKEN from env (dotenv-friendly — expects
 * an .env in the CWD). Provisions the fixture in order:
 *
 *   1. ContentTypes           (create + publish)
 *   2. Assets                 (upload + processForAllLocales + publish)
 *   3. Entries                (create + publish, with tempId asset refs resolved)
 *   4. Design tokens          (PUT via raw HTTP — plain client doesn't cover this yet)
 *   5. ComponentTypes         (create + publish, referencing tokens by id)
 *   6. Template               (create + publish)
 *   7. DataAssemblies         (create + publish, with cross-fixture ids resolved)
 *   8. Link DAs to CTs        (append DA links to composed CTs, republish CTs)
 *   9. Experience             (create + publish, with dataAssembly + entry refs resolved)
 *
 * Idempotent per resource: if a resource with the fixture's id already exists,
 * skip it. Re-running against a half-seeded env picks up where a previous run
 * left off.
 *
 * Prints the resulting experienceId at the end.
 *
 * Run with:
 *   npm run bootstrap
 */
/* eslint-disable no-console */
import { createClient, type PlainClientAPI } from 'contentful-management';
import { readFileSync } from 'node:fs';

import {
  contentTypes,
  assets,
  entries,
  designTokens,
  componentTypes,
  templates,
  dataAssemblies,
  dataAssemblyComponentTypeLinks,
  experience,
  type AssetFixture,
  type EntryFixture,
  type ContentTypeFixture,
  type ComponentTypeFixture,
  type TemplateFixture,
  type DataAssemblyFixture,
  type DesignTokenFixture,
  type ExperienceFixture,
  type ExperienceNode,
  type TempId,
} from './fixture/index.js';

// --- Env ---------------------------------------------------------------------

// Load a local .env if present, without adding dotenv as a hard dep.
try {
  const envPath = process.env.DOTENV_PATH || '.env';
  const contents = readFileSync(envPath, 'utf8');
  for (const line of contents.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]!]) {
      process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
    }
  }
} catch {
  // no .env — assume env is set elsewhere
}

const { SPACE_ID, ENVIRONMENT_ID, CMA_TOKEN } = process.env;
if (!SPACE_ID || !ENVIRONMENT_ID || !CMA_TOKEN) {
  console.error(
    'Missing env — set SPACE_ID, ENVIRONMENT_ID, and CMA_TOKEN (either in the shell or in a local .env).'
  );
  process.exit(1);
}

const cma: PlainClientAPI = createClient(
  { accessToken: CMA_TOKEN },
  { type: 'plain', defaults: { spaceId: SPACE_ID, environmentId: ENVIRONMENT_ID } }
);

// --- Small helpers -----------------------------------------------------------

const log = (msg: string) => console.log(msg);
const step = (label: string) => log(`\n▸ ${label}`);

// contentful-sdk-core wraps API errors as new Error() with .name = data.sys.id
// (e.g. 'NotFound') and JSON-stringifies the payload into .message. Neither
// .status nor .response is available. Check name; fall back to parsing the
// JSON message for a status field so we don't miss anything.
const isNotFound = (err: unknown): boolean => {
  const e = err as { name?: string; message?: string };
  if (e?.name === 'NotFound') return true;
  if (typeof e?.message === 'string') {
    try {
      const parsed = JSON.parse(e.message) as { status?: number };
      if (parsed?.status === 404) return true;
    } catch {
      /* not JSON — ignore */
    }
  }
  return false;
};

// Registry of tempId → real Contentful sys.id, built as resources are created.
const idMap = new Map<TempId, string>();
const remember = (tempId: TempId, realId: string) => idMap.set(tempId, realId);
const resolveId = (tempId: TempId): string => {
  const id = idMap.get(tempId);
  if (!id) {
    throw new Error(`Unresolved tempId: ${tempId} (no resource with that tempId was created)`);
  }
  return id;
};

// A stable Contentful sys.id derived from a fixture tempId — keeps the seed
// idempotent since we can .get() by known id before .create()ing.
const stableId = (tempId: TempId) =>
  `demo-${tempId.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;

// --- URN builders ------------------------------------------------------------

const componentTypeUrn = (id: string) =>
  `crn:contentful:::experience:spaces/$self/environments/$self/componentTypes/${id}`;
const templateUrn = (id: string) =>
  `crn:contentful:::experience:spaces/$self/environments/$self/templates/${id}`;
const dataAssemblyUrn = (id: string) =>
  `crn:contentful:::experience:spaces/$self/environments/$self/dataAssemblies/${id}`;
const entryUrn = (id: string) =>
  `crn:contentful:::content:spaces/$self/environments/$self/entries/${id}`;

const SAME_SPACE_CONTENT_SOURCE = 'crn:contentful:::content:spaces/$self/environments/$self';

// --- Raw CMA fetch (for endpoints the plain client doesn't expose) ----------

const CMA_BASE = `https://api.contentful.com/spaces/${SPACE_ID}/environments/${ENVIRONMENT_ID}`;

async function cmaFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${CMA_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${CMA_TOKEN}`,
      'Content-Type': 'application/vnd.contentful.management.v1+json',
      ...(init.headers ?? {}),
    },
  });
}

// --- Resource seeders --------------------------------------------------------

async function seedContentType(fixture: ContentTypeFixture) {
  try {
    await cma.contentType.get({ contentTypeId: fixture.id });
    log(`  ✓ ContentType "${fixture.id}" already exists — skipping`);
    return;
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }

  const created = await cma.contentType.createWithId(
    { contentTypeId: fixture.id },
    {
      name: fixture.name,
      description: fixture.description ?? '',
      displayField: fixture.displayField,
      fields: fixture.fields.map((f) => ({
        ...f,
        required: 'required' in f && f.required ? true : false,
        localized: 'localized' in f && f.localized ? true : false,
      })) as never,
    }
  );
  await cma.contentType.publish({ contentTypeId: fixture.id }, created);
  log(`  ✓ ContentType "${fixture.id}" created + published`);
}

async function seedAsset(fixture: AssetFixture) {
  const assetId = stableId(fixture.tempId);
  try {
    const existing = await cma.asset.get({ assetId });
    remember(fixture.tempId, existing.sys.id);
    log(`  ✓ Asset "${fixture.tempId}" already exists — skipping`);
    return;
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }

  log(`  … downloading ${fixture.sourceUrl}`);
  const res = await fetch(fixture.sourceUrl);
  if (!res.ok) throw new Error(`Failed to fetch ${fixture.sourceUrl}: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();

  const upload = await cma.upload.create({}, { file: arrayBuffer });

  const asset = await cma.asset.createWithId(
    { assetId },
    {
      fields: {
        title: { 'en-US': fixture.title },
        file: {
          'en-US': {
            contentType: fixture.contentType,
            fileName: fixture.fileName,
            uploadFrom: { sys: { type: 'Link', linkType: 'Upload', id: upload.sys.id } },
          },
        },
      } as never,
    }
  );
  const processed = await cma.asset.processForAllLocales({}, asset);
  // processForAllLocales returns the asset once processing is initiated; we
  // need to wait for the file URL to appear before publishing.
  const ready = await waitForAssetProcessed(processed.sys.id);
  await cma.asset.publish({ assetId: ready.sys.id }, ready);

  remember(fixture.tempId, ready.sys.id);
  log(`  ✓ Asset "${fixture.tempId}" → ${ready.sys.id}`);
}

async function waitForAssetProcessed(assetId: string, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    const a = await cma.asset.get({ assetId });
    const file = (a.fields.file as Record<string, { url?: string }> | undefined)?.['en-US'];
    if (file?.url) return a;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Asset ${assetId} did not finish processing within ${maxAttempts}s`);
}

// Recursively walk an entry's field values and swap { $assetTempId } placeholders
// for real Contentful Link->Asset payloads.
function resolveAssetRefs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(resolveAssetRefs);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.$assetTempId === 'string') {
      return { sys: { type: 'Link', linkType: 'Asset', id: resolveId(obj.$assetTempId) } };
    }
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, resolveAssetRefs(v)]));
  }
  return value;
}

async function seedEntry(fixture: EntryFixture) {
  const entryId = stableId(fixture.tempId);
  try {
    const existing = await cma.entry.get({ entryId });
    remember(fixture.tempId, existing.sys.id);
    log(`  ✓ Entry "${fixture.tempId}" already exists — skipping`);
    return;
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }

  const resolvedFields = resolveAssetRefs(fixture.fields) as Record<string, unknown>;
  const created = await cma.entry.createWithId(
    { entryId, contentTypeId: fixture.contentTypeId },
    { fields: resolvedFields as never }
  );
  await cma.entry.publish({ entryId: created.sys.id }, created);

  remember(fixture.tempId, created.sys.id);
  log(`  ✓ Entry "${fixture.tempId}" → ${created.sys.id}`);
}

async function seedDesignToken(fixture: DesignTokenFixture) {
  // Check existence first — an update needs the current version header, a
  // create doesn't. Design tokens are content-addressable by name, so if it
  // exists we can skip.
  const existing = await cmaFetch(`/design_tokens/${fixture.id}`, { method: 'GET' });
  if (existing.ok) {
    log(`  ✓ DesignToken "${fixture.id}" already exists — skipping`);
    return;
  }
  if (existing.status !== 404) {
    const body = await existing.text();
    throw new Error(`Unexpected status ${existing.status} checking design_token: ${body}`);
  }

  const res = await cmaFetch(`/design_tokens/${fixture.id}`, {
    method: 'PUT',
    body: JSON.stringify({ name: fixture.id, type: fixture.type, metadata: {} }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to PUT design_token "${fixture.id}": ${res.status} ${body}`);
  }
  log(`  ✓ DesignToken "${fixture.id}" (${fixture.type})`);
}

async function seedComponentType(fixture: ComponentTypeFixture) {
  const componentTypeId = fixture.id;
  try {
    await cma.componentType.get({ componentTypeId });
    log(`  ✓ ComponentType "${fixture.id}" already exists — skipping`);
    return;
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }

  const created = await cma.componentType.upsert(
    { componentTypeId },
    {
      sys: { id: componentTypeId, type: 'ComponentType' },
      name: fixture.name,
      description: fixture.description ?? '',
      viewports: [{ id: 'all-sizes', query: '*', displayName: 'All Sizes', previewSize: '100%' }],
      contentProperties: (fixture.contentProperties ?? []).map((p) => ({
        ...p,
        required: p.required ?? false,
      })),
      designProperties: fixture.designProperties ?? [],
      slots: (fixture.slots ?? []).map((s) => ({
        ...s,
        required: false,
        validations: [],
      })),
    } as never
  );
  await cma.componentType.publish({
    componentTypeId,
    version: created.sys.version,
  });
  log(`  ✓ ComponentType "${fixture.id}" created + published`);
}

async function seedTemplate(fixture: TemplateFixture) {
  const templateId = fixture.id;
  try {
    await cma.template.get({ templateId });
    log(`  ✓ Template "${fixture.id}" already exists — skipping`);
    return;
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }

  const created = await cma.template.upsert(
    { templateId },
    {
      sys: { id: templateId, type: 'Template' },
      name: fixture.name,
      description: fixture.description ?? '',
      viewports: [{ id: 'all-sizes', query: '*', displayName: 'All Sizes', previewSize: '100%' }],
      contentProperties: (fixture.contentProperties ?? []).map((p) => ({
        ...p,
        required: p.required ?? false,
      })),
      designProperties: fixture.designProperties ?? [],
    } as never
  );
  await cma.template.publish({ templateId, version: created.sys.version });
  log(`  ✓ Template "${fixture.id}" created + published`);
}

async function seedDataAssembly(fixture: DataAssemblyFixture) {
  // DataAssemblies use server-assigned ids. To be idempotent we tag by name.
  const existing = await cma.dataAssembly.getMany({ query: { limit: 100 } });
  const match = existing.items.find((da) => da.name === fixture.name);
  if (match) {
    remember(fixture.tempId, match.sys.id);
    log(`  ✓ DataAssembly "${fixture.name}" already exists — skipping`);
    return;
  }

  const parameters: Record<string, unknown> = {};
  for (const [pid, pdef] of Object.entries(fixture.parameters)) {
    parameters[pid] = {
      name: pdef.name,
      type: 'ResourceLink',
      linkType: 'Contentful:Entry',
      allowedResources: [
        {
          type: 'Contentful:Entry',
          source: SAME_SPACE_CONTENT_SOURCE,
          allowedTypes: pdef.allowedContentTypes,
        },
      ],
    };
  }

  const created = await cma.dataAssembly.create(
    {},
    {
      sys: {
        type: 'DataAssembly',
        dataType: fixture.dataType.map((p) => ({
          ...p,
          required: p.required ?? false,
        })),
      },
      name: fixture.name,
      description: fixture.description ?? '',
      metadata: { tags: [] },
      parameters,
      resolvers: fixture.resolvers,
      return: fixture.return,
    } as never
  );
  await cma.dataAssembly.publish({
    dataAssemblyId: created.sys.id,
    version: created.sys.version,
  });

  remember(fixture.tempId, created.sys.id);
  log(`  ✓ DataAssembly "${fixture.name}" → ${created.sys.id}`);
}

// After DAs are created, ComponentTypes that host DA-bound nodes need those
// DAs listed on their `dataAssemblies` field, or Experience publish fails
// with `DataAssemblyMembershipViolation`.
async function linkDataAssembliesToComponentTypes() {
  // Group DA links by target ComponentType so we do one update per CT.
  const byComponentType = new Map<string, string[]>();
  for (const link of dataAssemblyComponentTypeLinks) {
    const daId = resolveId(link.dataAssemblyTempId);
    const arr = byComponentType.get(link.componentTypeId) ?? [];
    arr.push(daId);
    byComponentType.set(link.componentTypeId, arr);
  }

  for (const [componentTypeId, daIds] of byComponentType) {
    const current = await cma.componentType.get({ componentTypeId });
    const existingLinks = new Set(
      (current.dataAssemblies ?? []).map((l) => l.sys.urn.split('/').pop()!)
    );
    const missing = daIds.filter((id) => !existingLinks.has(id));
    if (missing.length === 0) {
      log(`  ✓ ComponentType "${componentTypeId}" already links all DAs — skipping`);
      continue;
    }

    const newLinks = [
      ...(current.dataAssemblies ?? []),
      ...missing.map((id) => ({
        sys: {
          type: 'ResourceLink' as const,
          linkType: 'Contentful:DataAssembly' as const,
          urn: dataAssemblyUrn(id),
        },
      })),
    ];
    const updated = await cma.componentType.upsert(
      { componentTypeId },
      {
        sys: { id: componentTypeId, type: 'ComponentType', version: current.sys.version },
        name: current.name,
        description: current.description,
        viewports: current.viewports,
        contentProperties: current.contentProperties,
        designProperties: current.designProperties,
        slots: current.slots,
        dataAssemblies: newLinks,
      } as never
    );
    await cma.componentType.publish({
      componentTypeId,
      version: updated.sys.version,
    });
    log(`  ✓ ComponentType "${componentTypeId}" linked to ${missing.length} DA(s)`);
  }
}

// Walk fixture nodes and swap tempIds for real ids in contentBindings.
function resolveNode(node: ExperienceNode): unknown {
  const out: Record<string, unknown> = {
    id: node.id,
    nodeType: node.nodeType,
    componentType: {
      sys: {
        type: 'ResourceLink',
        linkType: 'Contentful:ComponentType',
        urn: componentTypeUrn(node.componentTypeId),
      },
    },
  };
  if ('designProperties' in node && node.designProperties) {
    out.designProperties = node.designProperties;
  }
  if ('contentProperties' in node && node.contentProperties) {
    out.contentProperties = node.contentProperties;
  }
  if ('contentBindings' in node && node.contentBindings) {
    const parameters: Record<string, unknown> = {};
    for (const [pid, ref] of Object.entries(node.contentBindings.parameters)) {
      parameters[pid] = {
        sys: {
          type: 'ResourceLink',
          linkType: 'Contentful:Entry',
          urn: entryUrn(resolveId(ref.$entryTempId)),
        },
      };
    }
    out.contentBindings = {
      sys: {
        type: 'ResourceLink',
        linkType: 'Contentful:DataAssembly',
        urn: dataAssemblyUrn(resolveId(node.contentBindings.dataAssemblyTempId)),
      },
      parameters,
    };
  }
  if (node.slots) {
    const slots: Record<string, unknown[]> = {};
    for (const [slotName, children] of Object.entries(node.slots)) {
      slots[slotName] = children.map(resolveNode);
    }
    out.slots = slots;
  } else {
    out.slots = {};
  }
  return out;
}

async function seedExperience(fixture: ExperienceFixture) {
  const experienceId = fixture.id;
  let existing: Awaited<ReturnType<typeof cma.experience.get>> | null = null;
  try {
    existing = await cma.experience.get({ experienceId });
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }

  // Create if missing.
  if (!existing) {
    const slots: Record<string, unknown[]> = {};
    for (const [slotName, children] of Object.entries(fixture.slots)) {
      slots[slotName] = children.map(resolveNode);
    }
    existing = await cma.experience.upsert(
      { experienceId },
      {
        sys: { id: experienceId, type: 'Experience' },
        template: {
          sys: {
            type: 'ResourceLink',
            linkType: 'Contentful:Template',
            urn: templateUrn(fixture.templateId),
          },
        },
        name: fixture.name,
        description: fixture.description ?? '',
        viewports: fixture.viewports,
        designProperties: {},
        metadata: { tags: [], concepts: [] },
        slots,
      } as never
    );
    log(`  ✓ Experience "${fixture.id}" created`);
  } else {
    log(`  ✓ Experience "${fixture.id}" already exists`);
  }

  // Publish if not yet published.
  const isPublished =
    !!existing.sys.publishedVersion && existing.sys.publishedVersion === existing.sys.version;
  if (isPublished) {
    log(`  ✓ Experience "${fixture.id}" already published`);
  } else {
    await cma.experience.publish(
      { experienceId: existing.sys.id, version: existing.sys.version },
      { add: ['en-US'] }
    );
    log(`  ✓ Experience "${fixture.id}" published`);
  }
  return experienceId;
}

// --- Orchestrator ------------------------------------------------------------

async function main() {
  log(`Bootstrapping ExO demo into space ${SPACE_ID} / env ${ENVIRONMENT_ID}\n`);

  step('Step 1/9 — ContentTypes');
  for (const ct of contentTypes) await seedContentType(ct);

  step('Step 2/9 — Assets');
  for (const a of assets) await seedAsset(a);

  step('Step 3/9 — Entries');
  for (const e of entries) await seedEntry(e);

  step('Step 4/9 — Design tokens');
  for (const t of designTokens) await seedDesignToken(t);

  step('Step 5/9 — ComponentTypes');
  for (const ct of componentTypes) await seedComponentType(ct);

  step('Step 6/9 — Template');
  for (const t of templates) await seedTemplate(t);

  step('Step 7/9 — DataAssemblies');
  for (const da of dataAssemblies) await seedDataAssembly(da);

  step('Step 8/9 — Link DataAssemblies to composed ComponentTypes');
  await linkDataAssembliesToComponentTypes();

  step('Step 9/9 — Experience');
  const experienceId = await seedExperience(experience);

  log(`\n✅ Done.\n`);
  log(`   Experience id: ${experienceId}`);
  log(
    `   Set NEXT_PUBLIC_EXPERIENCE_ID=${experienceId} (or paste it into your .env.local) and run \`npm run dev\`.`
  );
}

main().catch((err) => {
  console.error('\n✗ Bootstrap failed:', err);
  process.exit(1);
});

/**
 * Bootstrap the ExO example into a caller-specified Contentful space/environment.
 *
 * Reads SPACE_ID / ENVIRONMENT_ID / CMA_TOKEN from env (dotenv-friendly — expects
 * an .env in the CWD). Provisions the fixture in order:
 *
 *   1. ContentTypes             (create + publish)
 *   2. Assets                   (upload + processForAllLocales + publish)
 *   3. Entries                  (create + publish, with tempId asset refs resolved)
 *   4. Design tokens            (PUT via raw HTTP — plain client doesn't cover this yet)
 *   5. Components               (create + publish, referencing tokens by id)
 *   6. Experience Template      (create + publish)
 *   7. DataAssemblies           (create + publish, with cross-fixture ids resolved)
 *   8. Link DAs to Components   (append DA links to composed Components, republish them)
 *   9. Experience               (create + publish, with dataAssembly + entry refs resolved)
 *      + Optimization Variant   (developer-focused personalized hero)
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
/* global fetch, RequestInit, Response */
import { createClient, type PlainClientAPI } from 'contentful-management';
import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

import {
  contentTypes,
  assets,
  entries,
  designTokens,
  components,
  experienceTemplates,
  dataAssemblies,
  dataAssemblyComponentLinks,
  experience,
  personalization,
  type AssetFixture,
  type EntryFixture,
  type ContentTypeFixture,
  type ComponentFixture,
  type ExperienceTemplateFixture,
  type DataAssemblyFixture,
  type DesignTokenFixture,
  type ExperienceFixture,
  type ExperiencePersonalizationFixture,
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
const stableId = (tempId: TempId) => `demo-${tempId.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;

// --- URN builders ------------------------------------------------------------

const componentUrn = (id: string) =>
  `crn:contentful:::experience:spaces/$self/environments/$self/components/${id}`;
const experienceTemplateUrn = (id: string) =>
  `crn:contentful:::experience:spaces/$self/environments/$self/experienceTemplates/${id}`;
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

async function cmaJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await cmaFetch(path, init);
  if (!response.ok) {
    throw new Error(
      `${init.method ?? 'GET'} ${path} failed (${response.status}): ${await response.text()}`
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
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

  // Bytes live on disk under fixture/assets/; resolved relative to this file
  // so the script works from any CWD.
  const absPath = resolvePath(__dirname, 'fixture', fixture.sourcePath);
  log(`  … reading ${fixture.sourcePath}`);
  const bytes = readFileSync(absPath);
  // Node's Buffer is a Uint8Array; the upload API accepts ArrayBuffer/Stream.
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

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

async function seedComponent(fixture: ComponentFixture) {
  const componentId = fixture.id;
  try {
    await cma.component.get({ componentId });
    log(`  ✓ Component "${fixture.id}" already exists — skipping`);
    return;
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }

  const created = await cma.component.upsert({ componentId }, {
    sys: { id: componentId, type: 'Component' },
    name: fixture.name,
    description: fixture.description ?? '',
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
  } as never);
  await cma.component.publish({
    componentId,
    version: created.sys.version,
  });
  log(`  ✓ Component "${fixture.id}" created + published`);
}

async function seedExperienceTemplate(fixture: ExperienceTemplateFixture) {
  const experienceTemplateId = fixture.id;
  let existing: Awaited<ReturnType<typeof cma.experienceTemplate.get>> | null = null;
  try {
    existing = await cma.experienceTemplate.get({ experienceTemplateId });
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }

  const desiredSlots = (fixture.slots ?? []).map((s) => ({
    ...s,
    required: false,
    validations: [],
  }));
  const desiredTree = fixture.componentTree ?? [];

  const experienceTemplateBody = {
    name: fixture.name,
    description: fixture.description ?? '',
    contentProperties: (fixture.contentProperties ?? []).map((p) => ({
      ...p,
      required: p.required ?? false,
    })),
    designProperties: fixture.designProperties ?? [],
    slots: desiredSlots,
    componentTree: desiredTree,
    // Composed (not Coded) — a Coded Experience Template requires an empty
    // componentTree. The `page` Experience Template has a Slot node in its
    // tree, so it must be composed.
    metadata: {
      tags: [],
      annotations: {
        Template: [
          {
            sys: {
              id: 'Contentful:ComposedImplementation',
              type: 'Link',
              linkType: 'Annotation',
            },
          },
        ],
      },
    },
  };

  if (!existing) {
    const created = await cma.experienceTemplate.upsert({ experienceTemplateId }, {
      sys: { id: experienceTemplateId, type: 'ExperienceTemplate' },
      ...experienceTemplateBody,
    } as never);
    await cma.experienceTemplate.publish({
      experienceTemplateId,
      version: created.sys.version,
    });
    log(`  ✓ Experience Template "${fixture.id}" created + published`);
    return;
  }

  // Always upsert on existing so any fixture edit (slots, tree, annotations,
  // whatever) takes effect. If we're already published at the current version
  // we can skip the network round-trip.
  const isPublished =
    !!existing.sys.publishedVersion && existing.sys.publishedVersion === existing.sys.version;
  if (isPublished) {
    // Compare desired vs. current to decide if we still need to write.
    const currentTree = JSON.stringify(existing.componentTree ?? []);
    const desiredTreeJson = JSON.stringify(desiredTree);
    const currentSlotIds = (existing.slots ?? []).map((s) => s.id).sort();
    const desiredSlotIds = desiredSlots.map((s) => s.id).sort();
    const currentImpl = (
      ((existing.metadata as { annotations?: { Template?: Array<{ sys: { id: string } }> } })
        ?.annotations?.Template ?? []) as Array<{ sys: { id: string } }>
    )
      .map((a) => a.sys.id)
      .sort()
      .join(',');
    const desiredImpl = 'Contentful:ComposedImplementation';
    if (
      currentTree === desiredTreeJson &&
      JSON.stringify(currentSlotIds) === JSON.stringify(desiredSlotIds) &&
      currentImpl === desiredImpl
    ) {
      log(`  ✓ Experience Template "${fixture.id}" already exists — skipping`);
      return;
    }
  }

  const updated = await cma.experienceTemplate.upsert({ experienceTemplateId }, {
    sys: { id: experienceTemplateId, type: 'ExperienceTemplate', version: existing.sys.version },
    ...experienceTemplateBody,
  } as never);
  await cma.experienceTemplate.publish({
    experienceTemplateId,
    version: updated.sys.version,
  });
  log(`  ✓ Experience Template "${fixture.id}" updated + published`);
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
      allowedResources: [
        {
          type: 'Contentful:Entry',
          source: SAME_SPACE_CONTENT_SOURCE,
          allowedTypes: pdef.allowedContentTypes,
        },
      ],
    };
  }

  const created = await cma.dataAssembly.create({}, {
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
  } as never);
  await cma.dataAssembly.publish({
    dataAssemblyId: created.sys.id,
    version: created.sys.version,
  });

  remember(fixture.tempId, created.sys.id);
  log(`  ✓ DataAssembly "${fixture.name}" → ${created.sys.id}`);
}

// After DAs are created, Components that host DA-bound nodes need those DAs
// listed on their `dataAssemblies` field, or Experience publish fails with
// `DataAssemblyMembershipViolation`.
async function linkDataAssembliesToComponents() {
  // Group DA links by target Component so we do one update per Component.
  const byComponent = new Map<string, string[]>();
  for (const link of dataAssemblyComponentLinks) {
    const daId = resolveId(link.dataAssemblyTempId);
    const arr = byComponent.get(link.componentId) ?? [];
    arr.push(daId);
    byComponent.set(link.componentId, arr);
  }

  for (const [componentId, daIds] of byComponent) {
    const current = await cma.component.get({ componentId });
    const existingLinks = new Set(
      (current.dataAssemblies ?? []).map((l) => l.sys.urn.split('/').pop()!)
    );
    const missing = daIds.filter((id) => !existingLinks.has(id));
    if (missing.length === 0) {
      log(`  ✓ Component "${componentId}" already links all DAs — skipping`);
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
    const updated = await cma.component.upsert({ componentId }, {
      sys: { id: componentId, type: 'Component', version: current.sys.version },
      name: current.name,
      description: current.description,
      contentProperties: current.contentProperties,
      designProperties: current.designProperties,
      slots: current.slots,
      dataAssemblies: newLinks,
    } as never);
    await cma.component.publish({
      componentId,
      version: updated.sys.version,
    });
    log(`  ✓ Component "${componentId}" linked to ${missing.length} DA(s)`);
  }
}

// Walk fixture nodes and swap tempIds for real ids in contentBindings.
// Parameter bindings use the canonical `{ $literal: ResourceLink }` notation;
// the bare ResourceLink form is deprecated.
function resolveNode(node: ExperienceNode): unknown {
  const out: Record<string, unknown> = {
    id: node.id,
    nodeType: node.nodeType,
    component: {
      sys: {
        type: 'ResourceLink',
        linkType: 'Contentful:Component',
        urn: componentUrn(node.componentId),
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
        $literal: {
          sys: {
            type: 'ResourceLink',
            linkType: 'Contentful:Entry',
            urn: entryUrn(resolveId(ref.$entryTempId)),
          },
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

  const slots: Record<string, unknown[]> = {};
  for (const [slotName, children] of Object.entries(fixture.slots)) {
    slots[slotName] = children.map(resolveNode);
  }

  // Always upsert so we pick up experienceTemplate/DA changes from earlier
  // steps in the run — the CMA rejects Experience publish with
  // `DefiningEntityIsChanged` if any referenced entity has moved on since the
  // Experience's last version. `experienceTemplate` is immutable after
  // creation, so include it only on create.
  const experienceTemplateLink = {
    sys: {
      type: 'ResourceLink' as const,
      linkType: 'Contentful:ExperienceTemplate' as const,
      urn: experienceTemplateUrn(fixture.experienceTemplateId),
    },
  };
  const commonBody = {
    name: fixture.name,
    description: fixture.description ?? '',
    designProperties: {},
    metadata: { tags: [], concepts: [] },
    slots,
  };
  const upserted = await cma.experience.upsert(
    { experienceId },
    (existing
      ? {
          sys: { id: experienceId, type: 'Experience', version: existing.sys.version },
          ...commonBody,
        }
      : {
          sys: { id: experienceId, type: 'Experience' },
          experienceTemplate: experienceTemplateLink,
          ...commonBody,
        }) as never
  );
  log(
    existing ? `  ✓ Experience "${fixture.id}" updated` : `  ✓ Experience "${fixture.id}" created`
  );

  const isPublished =
    !!upserted.sys.publishedVersion && upserted.sys.publishedVersion === upserted.sys.version;
  if (isPublished) {
    log(`  ✓ Experience "${fixture.id}" already published`);
  } else {
    await cma.experience.publish(
      { experienceId: upserted.sys.id, version: upserted.sys.version },
      { add: ['en-US'] }
    );
    log(`  ✓ Experience "${fixture.id}" published`);
  }
  return experienceId;
}

type OptimizationVariant = {
  sys: {
    variant: string;
    version: number;
    publishedVersion?: number;
  };
  name: string;
};

function createPersonalizedSlots(
  slots: Record<string, unknown[]>,
  fixture: ExperiencePersonalizationFixture
): Record<string, unknown[]> {
  const clone = JSON.parse(JSON.stringify(slots)) as Record<string, unknown[]>;
  let replaced = false;

  const visit = (nodes: unknown[]) => {
    for (const value of nodes) {
      const node = value as Record<string, unknown>;
      if (node.id === fixture.targetNodeId) {
        const bindings = node.contentBindings as
          { parameters?: Record<string, unknown> } | undefined;
        if (!bindings?.parameters?.[fixture.bindingParameterId]) {
          throw new Error(
            `Node "${fixture.targetNodeId}" has no "${fixture.bindingParameterId}" binding`
          );
        }
        bindings.parameters[fixture.bindingParameterId] = {
          sys: {
            type: 'ResourceLink',
            linkType: 'Contentful:Entry',
            urn: entryUrn(resolveId(fixture.entry.tempId)),
          },
        };
        replaced = true;
      }
      for (const children of Object.values((node.slots as Record<string, unknown[]>) ?? {})) {
        visit(children);
      }
    }
  };

  for (const nodes of Object.values(clone)) visit(nodes);
  if (!replaced) {
    throw new Error(`Could not find node "${fixture.targetNodeId}" in the base Experience`);
  }
  return clone;
}

async function seedOptimizationVariant(fixture: ExperiencePersonalizationFixture): Promise<string> {
  const base = await cma.experience.get({ experienceId: fixture.experienceId });
  const path = `/experiences/${fixture.experienceId}/optimization_variants`;
  const collection = await cmaJson<{ items: OptimizationVariant[] }>(path);
  const matches = collection.items.filter(
    (item) => item.sys.variant !== 'default' && item.name === fixture.variant.name
  );
  // Updating "the first match" could silently rewrite a variant this script
  // never created, so refuse to guess when the name is ambiguous.
  if (matches.length > 1) {
    throw new Error(
      `Found ${matches.length} Optimization Variants named "${fixture.variant.name}" ` +
        `(${matches.map((item) => item.sys.variant).join(', ')}). ` +
        'Delete or rename the extras, then re-run.'
    );
  }
  const [existing] = matches;
  const variantBody = {
    name: fixture.variant.name,
    description: fixture.variant.description,
    designProperties: base.designProperties ?? {},
    contentBindings: base.contentBindings,
    metadata: base.metadata ?? { tags: [], concepts: [] },
    slots: createPersonalizedSlots((base.slots ?? {}) as Record<string, unknown[]>, fixture),
  };

  const variant = existing
    ? await cmaJson<OptimizationVariant>(`${path}/${existing.sys.variant}`, {
        method: 'PUT',
        headers: { 'X-Contentful-Version': String(existing.sys.version) },
        // The update endpoint rejects experienceTemplate as an unrecognized
        // key. A variant's template is immutable after creation.
        body: JSON.stringify(variantBody),
      })
    : await cmaJson<OptimizationVariant>(path, {
        method: 'POST',
        body: JSON.stringify({
          ...variantBody,
          // Required by the create endpoint only.
          experienceTemplate: base.sys.experienceTemplate,
        }),
      });
  log(`  ✓ Optimization Variant "${fixture.variant.name}" ${existing ? 'updated' : 'created'}`);

  if (variant.sys.publishedVersion !== variant.sys.version) {
    await cmaJson(`${path}/${variant.sys.variant}/published`, {
      method: 'PUT',
      headers: { 'X-Contentful-Version': String(variant.sys.version) },
    });
    log(`  ✓ Optimization Variant "${fixture.variant.name}" published`);
  } else {
    log(`  ✓ Optimization Variant "${fixture.variant.name}" already published`);
  }
  return variant.sys.variant;
}

type PersonalizationEntry = { sys: { version: number; publishedVersion?: number } };

/** Create or update + publish one Personalization app entry (nt_audience / nt_experience). */
async function upsertPersonalizationEntry(
  contentTypeId: string,
  entryId: string,
  fields: Record<string, unknown>
) {
  const path = `/entries/${entryId}`;
  const current = await cmaFetch(path);
  let entry: PersonalizationEntry;
  if (current.status === 404) {
    entry = await cmaJson<PersonalizationEntry>(path, {
      method: 'PUT',
      headers: { 'X-Contentful-Content-Type': contentTypeId },
      body: JSON.stringify({ fields }),
    });
  } else if (current.ok) {
    const existing = (await current.json()) as PersonalizationEntry;
    entry = await cmaJson<PersonalizationEntry>(path, {
      method: 'PUT',
      headers: { 'X-Contentful-Version': String(existing.sys.version) },
      body: JSON.stringify({ fields }),
    });
  } else {
    throw new Error(`GET ${path} failed (${current.status}): ${await current.text()}`);
  }
  await cmaJson(`${path}/published`, {
    method: 'PUT',
    headers: { 'X-Contentful-Version': String(entry.sys.version) },
  });
}

/**
 * Activates the personalized variant: an Audience matching the campaign URL and
 * an Optimization that swaps the baseline Experience for the variant. Rewriting
 * the Optimization every run keeps its variant id in sync, so recreating the
 * variant cannot leave the mapping pointing at a deleted id.
 */
async function seedOptimization(fixture: ExperiencePersonalizationFixture, variantId: string) {
  const { audience, optimization } = fixture;
  const en = <T>(value: T) => ({ 'en-US': value });

  await upsertPersonalizationEntry('nt_audience', audience.entryId, {
    nt_name: en(audience.name),
    nt_audience_id: en(audience.entryId),
    nt_metadata: en({ type: 'origin' }),
    nt_rules: en({
      any: [
        {
          all: [
            {
              type: 'location',
              count: '1',
              key: 'continent',
              operator: 'equal',
              value: audience.continent,
              conditions: [],
            },
          ],
        },
      ],
    }),
  });
  log(`  ✓ Audience "${audience.name}" upserted + published`);

  await upsertPersonalizationEntry('nt_experience', optimization.entryId, {
    nt_name: en(optimization.name),
    nt_type: en('nt_personalization'),
    nt_experience_id: en(optimization.optimizationId),
    nt_metadata: en({ type: 'origin' }),
    nt_audience: en({ sys: { type: 'Link', linkType: 'Entry', id: audience.entryId } }),
    nt_config: en({
      sticky: false,
      traffic: 1,
      // [baseline, variant]: send every matching visitor to the variant.
      distribution: [0, 1],
      components: [
        {
          type: 'ExperienceReplacement',
          baseline: { id: 'default', entityId: fixture.experienceId },
          variants: [{ id: variantId, entityId: fixture.experienceId }],
        },
      ],
    }),
  });
  log(`  ✓ Optimization "${optimization.name}" → variant ${variantId} upserted + published`);
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
  await seedEntry(personalization.entry);

  step('Step 4/9 — Design tokens');
  for (const t of designTokens) await seedDesignToken(t);

  step('Step 5/9 — Components');
  for (const c of components) await seedComponent(c);

  step('Step 6/9 — Experience Template');
  for (const t of experienceTemplates) await seedExperienceTemplate(t);

  step('Step 7/9 — DataAssemblies');
  for (const da of dataAssemblies) await seedDataAssembly(da);

  step('Step 8/9 — Link DataAssemblies to composed Components');
  await linkDataAssembliesToComponents();

  step('Step 9/9 — Experience');
  const experienceId = await seedExperience(experience);
  const variantId = await seedOptimizationVariant(personalization);
  await seedOptimization(personalization, variantId);

  log(`\n✅ Done.\n`);
  log(`   Experience id: ${experienceId}`);
  log(
    `   Run \`npm run dev\` in examples/nextjs or examples/sveltekit, then visit /${experienceId}.`
  );
}

main().catch((err) => {
  console.error('\n✗ Bootstrap failed:', err);
  process.exit(1);
});

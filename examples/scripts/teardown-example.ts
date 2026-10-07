/**
 * Teardown for the resources `bootstrap-example.ts` seeds.
 *
 * Deletes only resources whose ids come from the fixtures (plus the
 * Optimization Variants nested under the fixture Experience), so unrelated
 * content in the space is left alone. Resources are unpublished, then deleted.
 * Order matters for the CMA's reference checks, so the script makes several
 * passes and retries whatever a previous pass could not delete yet.
 *
 * Also removes the fixture's Personalization entries (the Optimization and its
 * Audience). Other Audiences or Optimizations in the space are left alone.
 *
 * Run with:
 *   cd examples/scripts
 *   npm run teardown
 */
/* eslint-disable no-console */
/* global fetch, RequestInit, Response */
import { readFileSync } from 'node:fs';

import {
  assets,
  dataAssemblies,
  designTokens,
  entries,
  experience,
  experienceTemplates,
  components,
  contentTypes,
  personalization,
} from './fixture/index.js';

try {
  const contents = readFileSync(process.env.DOTENV_PATH || '.env', 'utf8');
  for (const line of contents.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
} catch {
  // no .env — assume env is set elsewhere
}

const { SPACE_ID, ENVIRONMENT_ID, CMA_TOKEN } = process.env;
if (!SPACE_ID || !ENVIRONMENT_ID || !CMA_TOKEN) {
  console.error('Missing env — set SPACE_ID, ENVIRONMENT_ID, and CMA_TOKEN.');
  process.exit(1);
}

const BASE = `https://api.contentful.com/spaces/${SPACE_ID}/environments/${ENVIRONMENT_ID}`;
const MAX_PASSES = 4;

const call = (path: string, init: RequestInit = {}): Promise<Response> =>
  fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${CMA_TOKEN}`,
      'Content-Type': 'application/vnd.contentful.management.v1+json',
      ...(init.headers ?? {}),
    },
  });

// Same derivation as bootstrap-example.ts's stableId().
const stableId = (tempId: string) => `demo-${tempId.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;

type Sys = { sys: { version: number; publishedVersion?: number } };

/** Unpublish (if needed) and delete one resource. Returns true when it is gone. */
async function remove(path: string, label: string): Promise<boolean> {
  const got = await call(path);
  if (got.status === 404) return true;
  if (!got.ok) {
    console.log(`  ✗ ${label}: GET failed (${got.status})`);
    return false;
  }
  let { sys } = (await got.json()) as Sys;
  if (sys.publishedVersion) {
    const un = await call(`${path}/published`, {
      method: 'DELETE',
      headers: { 'X-Contentful-Version': String(sys.version) },
    });
    if (!un.ok) {
      console.log(`  … ${label}: unpublish blocked (${un.status}), will retry`);
      return false;
    }
    sys = ((await un.json()) as Sys).sys;
  }
  const del = await call(path, {
    method: 'DELETE',
    headers: { 'X-Contentful-Version': String(sys.version) },
  });
  if (!del.ok && del.status !== 404) {
    console.log(`  … ${label}: delete blocked (${del.status}), will retry`);
    return false;
  }
  console.log(`  ✓ ${label} deleted`);
  return true;
}

async function findDataAssemblyIds(): Promise<string[]> {
  const res = await call('/data_assemblies?limit=100');
  if (!res.ok) return [];
  const { items } = (await res.json()) as { items: Array<{ name: string; sys: { id: string } }> };
  const names = new Set(dataAssemblies.map((da) => da.name));
  return items.filter((item) => names.has(item.name)).map((item) => item.sys.id);
}

async function variantTargets(): Promise<Array<[string, string]>> {
  const base = `/experiences/${experience.id}/optimization_variants`;
  const res = await call(base);
  if (!res.ok) return [];
  const { items } = (await res.json()) as {
    items: Array<{ name: string; sys: { variant: string } }>;
  };
  return items
    .filter((item) => item.sys.variant !== 'default')
    .map((item) => [`${base}/${item.sys.variant}`, `Optimization Variant "${item.name}"`]);
}

async function main() {
  console.log(`Tearing down fixture resources in ${SPACE_ID}/${ENVIRONMENT_ID}`);
  const daIds = await findDataAssemblyIds();
  const pending = new Map<string, string>(); // path -> label (in dependency order)

  // The Optimization links to the Audience and to the variant, so it goes first.
  const { optimization, audience } = personalization;
  pending.set(`/entries/${optimization.entryId}`, `Optimization "${optimization.name}"`);
  pending.set(`/entries/${audience.entryId}`, `Audience "${audience.name}"`);
  for (const [path, label] of await variantTargets()) pending.set(path, label);
  pending.set(`/experiences/${experience.id}`, `Experience "${experience.id}"`);
  for (const t of experienceTemplates) {
    pending.set(`/experience_templates/${t.id}`, `Experience Template "${t.id}"`);
  }
  for (const c of components) pending.set(`/components/${c.id}`, `Component "${c.id}"`);
  for (const id of daIds) pending.set(`/data_assemblies/${id}`, `DataAssembly ${id}`);
  for (const t of designTokens) pending.set(`/design_tokens/${t.id}`, `DesignToken "${t.id}"`);
  for (const e of [...entries, personalization.entry]) {
    pending.set(`/entries/${stableId(e.tempId)}`, `Entry "${e.tempId}"`);
  }
  for (const a of assets) pending.set(`/assets/${stableId(a.tempId)}`, `Asset "${a.tempId}"`);
  for (const ct of contentTypes) pending.set(`/content_types/${ct.id}`, `ContentType "${ct.id}"`);

  for (let pass = 1; pass <= MAX_PASSES && pending.size > 0; pass++) {
    console.log(`\n▸ Pass ${pass} (${pending.size} remaining)`);
    for (const [path, label] of [...pending]) {
      if (await remove(path, label)) pending.delete(path);
    }
  }

  if (pending.size > 0) {
    console.error(`\n✗ Could not delete: ${[...pending.values()].join(', ')}`);
    process.exit(1);
  }
  console.log('\n✅ Teardown complete.');
}

main().catch((err) => {
  console.error('\n✗ Teardown failed:', err);
  process.exit(1);
});

# Local inspection source-map mock

This temporary layer adds source-map metadata to real Preview Session
responses. It uses delivered runtime IDs and a fixed capture of the authored
component graph. Preview content, component definitions, authentication,
rendering, and transport still come from the normal services and SDK.

Without a supplied map, this component-only capture constructs structural
inspection metadata. It cannot infer Experience or Fragment scopes or property
bindings, so that metadata is not a complete backend attribution map and does
not claim backend schema equivalence. Supplied scopes, property bindings, and map
tables remain intact; the mock never invents them.

The shared checkout has no real capture configured. Keep credentials, authored
captures, edits to `capture.ts`, and application dependency overrides local. Do
not include them in commits or copy this layer into the production SDK PR.

## Configure a capture

Use a single space and actual environment ID. Resolve environment aliases before
capturing. The supported graph contains direct `Component` nodes, composed
component implementations, and named or forwarded `Slot` placeholders. Each
placeholder retains its authored node ID as well as its logical slot ID. A slot
retains the entity that declares it; supplied content retains its authored owner
when passed through another component.

Inline or saved fragments, Experience/template authoring, loops, cross-space
references, and other node kinds are unsupported. The recipe rejects them rather
than inventing provenance. Use a backend source map for those scenarios.

Make `CMA_TOKEN` available through your approved credential source. Set these
nonsecret inputs in the same shell and choose a capture path that does not exist:

```sh
export EXO_DOMAIN=flinkly.com
export EXO_SPACE_ID=<SPACE_ID>
export EXO_ENVIRONMENT_ID=<ACTUAL_ENVIRONMENT_ID>
export INSPECTOR_ROOT_COMPONENT_ID=<COMPOSED_COMPONENT_ID>
export INSPECTOR_CAPTURE_PATH=/tmp/inspector-capture.json
```

Replace the angle-bracket placeholders. Choose the domain matching the target
environment. Run this read-only CMA capture from the SDK checkout. It records
authored node IDs, component IDs, and slot contents without credentials or content
property values. A failed capture must be resolved before using its output.

```sh
node --input-type=module <<'JS'
import fs from 'node:fs';

const { EXO_SPACE_ID: spaceId, EXO_ENVIRONMENT_ID: environmentId,
  INSPECTOR_ROOT_COMPONENT_ID: rootComponentId, INSPECTOR_CAPTURE_PATH: output,
  CMA_TOKEN: token } = process.env;
const domain = process.env.EXO_DOMAIN || 'flinkly.com';
if (!spaceId || !environmentId || !rootComponentId || !output || !token) {
  throw new Error('Set space, environment, root component, output, and CMA_TOKEN');
}
if (!['flinkly.com', 'contentful.com', 'eu.contentful.com'].includes(domain)) {
  throw new Error('Choose the Contentful domain matching the target environment');
}
if (fs.existsSync(output)) throw new Error('Choose a fresh capture output path');
const base = `https://api.${domain}/spaces/${encodeURIComponent(spaceId)}` +
  `/environments/${encodeURIComponent(environmentId)}/components/`;
const trees = Object.create(null);
const complete = new Set();
const active = new Set();

async function captureNodes(nodes) {
  const captured = [];
  for (const node of nodes) {
    if (node.nodeType === 'Slot') {
      if (typeof node.id !== 'string' || !node.id ||
          typeof node.slotId !== 'string' || !node.slotId) {
        throw new Error('Slot is missing an authored id or slotId');
      }
      captured.push({ id: node.id, slot: node.slotId });
      continue;
    }
    if (node.nodeType !== 'Component' || typeof node.id !== 'string' || !node.id) {
      throw new Error(`Unsupported authored node: ${node.nodeType}`);
    }
    const urn = node.component?.sys?.urn;
    const link = typeof urn === 'string' && urn.match(
      /^crn:contentful:::experience:spaces\/([^/]+)\/environments\/([^/]+)\/components\/([^/]+)$/
    );
    if (!link) throw new Error(`Missing component ResourceLink on ${node.id}`);
    const [, linkedSpace, linkedEnvironment, componentId] = link;
    if (!['$self', spaceId].includes(linkedSpace) ||
        !['$self', environmentId].includes(linkedEnvironment)) {
      throw new Error('Keep the capture in one space and environment');
    }
    await captureComponent(componentId);
    const slots = Object.create(null);
    for (const [slot, children] of Object.entries(node.slots || {})) {
      if (!Array.isArray(children)) throw new Error(`Invalid slot ${slot}`);
      slots[slot] = await captureNodes(children);
    }
    captured.push({ id: node.id, component: componentId,
      ...(Object.keys(slots).length ? { slots } : {}) });
  }
  return captured;
}

async function captureComponent(id) {
  if (active.has(id)) throw new Error(`Composition cycle at component ${id}`);
  if (complete.has(id)) return;
  active.add(id);
  const response = await fetch(base + encodeURIComponent(id), {
    headers: { Authorization: `Bearer ${token}`,
      'x-contentful-enable-alpha-feature': 'new-exo-entity-types' },
  });
  if (!response.ok) throw new Error(`Read component ${id}: HTTP ${response.status}`);
  const component = await response.json();
  if (Array.isArray(component.componentTree)) {
    trees[id] = [];
    trees[id] = await captureNodes(component.componentTree);
  } else if (component.componentTree !== null) {
    throw new Error(`Component ${id} has no recognized implementation`);
  }
  active.delete(id);
  complete.add(id);
}

await captureComponent(rootComponentId);
if (!trees[rootComponentId]?.length) throw new Error('Choose a nonempty composed root');
fs.writeFileSync(output,
  JSON.stringify({ spaceId, environmentId, rootComponentId, trees }, null, 2) + '\n',
  { mode: 0o600, flag: 'wx' });
console.log(`Captured ${Object.keys(trees).length} composed trees into ${output}`);
JS
```

In `capture.ts`, replace the `undefined` initializer of `capture` with the JSON
object. Keep its `InspectorCapture | undefined` annotation and record the capture
date locally. Coded component definitions are leaves, so `trees` contains only
composed implementations. Never substitute runtime IDs for authored IDs.

A captured placeholder has the form `{ id: "authored-placeholder", slot: "body" }`.
Its `id` comes from the authored Slot node's `node.id`; `slot` comes from
`node.slotId`. Captures made without placeholder IDs must be recaptured. Never
invent IDs or use the logical slot ID as a substitute.

For repeated-placement checks, use a composed root with several instances of the
same component. Supply authored content through a named slot, nest a composed
component with its own slot in one placement, and leave another empty. Include
forwarding and same-named slots in different owners to check ownership. When the
same supplied content passes through different authored placeholders, its paths
retain the distinct placeholder source nodes. This does not add support for loop
iterations.

## Pack and install one SDK graph

From the SDK root, build and pack the React adapter and its workspace dependency
graph. Explicitly include live-preview and runtime:

```sh
npx nx run-many -t pack --projects=adapter-react,live-preview,runtime
export INSPECTOR_SDK_DIR="$PWD"
```

In the consumer repository, stop the development server. Install all six local
packages together using root overrides. This example updates local application
configuration; preserve unrelated overrides and keep the resulting manifest and
lockfile edits out of commits:

```sh
node --input-type=module <<'JS'
import fs from 'node:fs';
import path from 'node:path';
if (!process.env.INSPECTOR_SDK_DIR) throw new Error('Set INSPECTOR_SDK_DIR first');
const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
manifest.overrides ??= {};
for (const name of ['react', 'live-preview', 'sdk-core', 'design', 'client', 'runtime']) {
  manifest.overrides[`@contentful/experiences-${name}`] =
    `file:${path.join(process.env.INSPECTOR_SDK_DIR, 'pkgs',
      `contentful-experiences-${name}-local.tgz`)}`;
}
fs.writeFileSync('package.json', JSON.stringify(manifest, null, 2) + '\n');
JS
npm install
npm ls @contentful/experiences-react @contentful/experiences-live-preview @contentful/experiences-sdk-core @contentful/experiences-design @contentful/experiences-client @contentful/experiences-runtime
```

If the app declares an SDK package as a direct root dependency, npm requires its
dependency spec and override to agree. Set that direct dependency to the same
`file:` archive before installing. Check `npm ls` for duplicate SDK instances.
Repack, reinstall the refreshed archives, and restart after every SDK or capture
change. Inspect the installed live-preview code if an old archive appears cached.

For Svelte or Angular, pack that adapter instead and replace `react` in the local
installation recipe. Include any additional SDK packages the app consumes in the
same local graph.

## Connect a development preview

Use `inspection: true` on the framework's combined live-preview integration. An
old consumer using `inspector: true` must update its option before validation.
The combined integration owns the Preview Session subscription and requests the
source map. `previewSessionOptions.sourceMap: true` can request a map independently
of geometry.

For an existing renderer, the public helpers only observe its committed map:

- React: `useLivePreviewInspection({ sourceMap, enabled: true })`.
- Svelte: `useLivePreviewInspection(() => ({ sourceMap, enabled: true }))`.
- Angular: `injectLivePreviewInspection(() => ({ sourceMap, enabled: true }))`.

These helpers do not open subscriptions. The shared geometry API is
`observePreviewGeometry({ sourceMap })`; it does not accept a render plan or parse
authored provenance. See the [live-preview README](../../README.md#inspection-geometry)
and the framework README for the complete integration and lifecycle contract.

The consumer still needs working component registrations, a Preview API key,
matching preview/CMA/UI hosts, and an editor build that consumes source-map geometry
messages. Keep preview credentials in its ignored local environment file.

For the external `exo-example-apps` marketing example, configure its local
`EXO_DOMAIN`, `EXO_SPACE_ID`, `EXO_ENVIRONMENT_ID`, and
`EXO_PREVIEW_ACCESS_TOKEN` according to that application's setup guide. Start its
development server and configure the editor's preview URL with matching values:

```text
http://localhost:3000/live-preview?spaceId=<SPACE_ID>&environmentId=<ACTUAL_ENVIRONMENT_ID>&domain=<DOMAIN>
```

Open the component editor on the same machine. The editor supplies
`preview_session_id`; opening the route alone leaves the app waiting for a
session. A production build intentionally bypasses this mock.

## Verify the capture

The shared Preview Session response hook runs after a valid WebSocket `next`
message. It applies the mock only in development, with `sourceMap: true`, for the
configured space/environment and matching captured topology. Nonmatching updates
pass through normally. Maps that already contain authored source nodes pass
through unchanged. Unusable maps and ambiguous entity rows also pass through;
the capture cannot distinguish same-ID entities from different spaces or scopes.
There is no framework-specific mock path.

A supplied map must agree with the captured component and slot ancestry through
the captured root. Conflicting ancestry or missing runtime mappings pass through
unchanged, even if the delivered component shape still matches.

Check these observable results with the target fixture:

- The preview WebSocket requests `source_map=true`. Real content still updates,
  and runtime node IDs match the delivered response and DOM roots.
- `extensions.sourceMap.layers` contains `SourceNode` rows with `sourceEntity`
  pointing to an entity layer. `nodes[runtimeId].layers` references those rows in
  leaf-to-root order. Owner-qualified `Slot` rows distinguish same-named slots.
  Each authored Slot placeholder also contributes a `SourceNode` row with its
  own authored ID and storage owner, alongside the logical `Slot` row.
  Empty placeholders retain both rows even when no delivered children use them.
  There is no separate `sources`/`sourceNodes` table, `nodes[id].path`, or
  `instantiates` field.
- Existing map tables, metadata, and response-local indexes remain consistent.
  Geometry forwards the full map unchanged in `canvasGeometryUpdated`.
- Selecting implementation descendants and supplied slot content retains the
  correct authored owner, including repeated placements and forwarded slots.
  Each occurrence keeps its own runtime ID and visible bounds.
- Resize and scroll preserve alignment. A committed mapless render clears
  targets; rejected updates keep the last committed render/map. Disabling or
  tearing down inspection cancels pending work without a final clearing message.

The capture is fixed. Add/remove/reorder edits require recapturing, repacking, and
reinstalling. Reordering identical component kinds can preserve the topology and
still invalidate ownership, so compare known authored IDs when selecting nodes.
Content-property edits can remain live.

This workflow does not verify backend map generation, structural live edits,
Duplicate/Undo, or deployed editor integration. Full cross-repository mock QA and
deployed Assemblies/Flinkly end-to-end checks remain separate work.

## Files

- `capture.ts`: local target IDs and authored graph, unset in shared source.
- `source-map.ts`: topology matching and source-map construction.
- `override-response.ts`: development and request guards.
- `../preview-session.ts`: shared incoming-response hook.

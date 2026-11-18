# Inspector testing in a chosen space

Use UI [PR #35352](https://github.com/contentful/user_interface/pull/35352) with
this SDK testing branch, `max/exo-inspector-testing-mocks`. The
[proposal](https://contentful.atlassian.net/wiki/spaces/PROD/pages/7246577729/ExO+Live+Preview+Inspector+PoC+and+Proposal)
also describes the deployed Assemblies path.

This guide can be followed by an agent for any space and environment that support
ExO Preview Sessions. Choose matching UI, CMA, and preview hosts. The staging
examples use `flinkly.com`; other regions require the corresponding UI backend
configuration and domain.

The checked-in mock is an example capture. Before using another space, capture
that space's authored trees and update the mock's request guard. Changing the URL
alone does not change the captured IDs or source paths.

The app receives real content and runtime IDs over the Preview Session WebSocket.
Only `extensions.sourceMap` is constructed. Authentication, component definitions,
and the normal preview backend remain necessary. This setup does not establish
that Assemblies generates or transports source maps correctly.

## Inputs and access

Obtain these inputs from the user, connected configuration, or the target space.
Never copy credentials from this guide or assume access to a particular space.

| Input                         | Meaning                                                       |
| ----------------------------- | ------------------------------------------------------------- |
| `EXO_DOMAIN`                  | Domain matching the target environment, such as `flinkly.com` |
| `EXO_SPACE_ID`                | Target space ID                                               |
| `EXO_ENVIRONMENT_ID`          | Actual environment ID used by both the editor and preview     |
| `INSPECTOR_ROOT_COMPONENT_ID` | Composed component to inspect                                 |
| `CMA_TOKEN`                   | Management credential able to read the chosen component graph |
| Preview API key               | Preview credential with access to that environment            |

Use each repository's required runtime and package-registry credentials. Keep CMA
credentials in the agent's approved credential source or process environment.
Keep preview credentials in the example app's ignored `.env.local` file.

## Prepare a fixture

Reuse a suitable composed component, or create a small test fixture in the chosen
space. Record the actual entity and node IDs returned by the editor or CMA.

The example app registers coded Section, Flex, Heading, Paragraph, Link, and other
components. Its definitions are in
`examples/nextjs-ctfl-marketing/scripts/cko-create-space/component-definitions.ts`
in `exo-example-apps`. Reuse compatible definitions. If creating them, set coded
`componentTree` values to `null`, preserve composed trees and ResourceLinks, omit
optional demo DataAssembly associations, and publish referenced components when
needed by preview resolution. Preserve unrelated definitions and use versioned
writes. Register different coded IDs in `app/experience-config.ts` if necessary.

For a useful inspection fixture, create three placements of a composed section.
Give that section a named body slot and its own layout, heading, and paragraph.
Put authored layout/content nodes in one placement's slot, a composed card with
an actions slot in another, and leave the third empty. A card can contain a Flex,
Heading, Paragraph, and supplied button-style Links. These are suggested shapes,
not required component names or IDs.

The mock supports single-space component composition, direct component nodes,
inline component fragments using `InlineExperienceFragment`, and named slots.
Choose a fixture using those node kinds. Use deployed Assemblies for loops,
saved-fragment identity, cross-space references, or other unsupported constructs.
The mock recipe targets the component editor; use the deployed path for complete
Experience/template validation.

## Capture the target authoring trees

Check out `max/exo-inspector-testing-mocks` in `experiences` and install its
dependencies with `npm ci`. Set the following inputs in the same shell, and make
`CMA_TOKEN` available through the approved credential source:

```sh
export EXO_DOMAIN=flinkly.com
export EXO_SPACE_ID=<SPACE_ID>
export EXO_ENVIRONMENT_ID=<ENVIRONMENT_ID>
export INSPECTOR_ROOT_COMPONENT_ID=<ROOT_COMPONENT_ID>
export INSPECTOR_TREES_PATH=/tmp/inspector-authored-trees.json
```

Replace angle-bracket placeholders before running the commands. Resolve an
environment alias to its actual ID before capturing. The following read-only CMA
recipe captures the chosen component and every referenced composed component.
It retains authored node IDs, component IDs, slot IDs, and slot contents. Coded
components are leaves and do not get entries in `trees`. The output contains no
credentials or content-property values. If capture fails, stop and resolve the
error before applying a snapshot; do not reuse an older output file.

```sh
node --input-type=module <<'JS'
import fs from 'node:fs';

const { EXO_SPACE_ID: spaceId, EXO_ENVIRONMENT_ID: environmentId,
  INSPECTOR_ROOT_COMPONENT_ID: rootId, INSPECTOR_TREES_PATH: output,
  CMA_TOKEN: token } = process.env;
const domain = process.env.EXO_DOMAIN || 'flinkly.com';
if (!spaceId || !environmentId || !rootId || !output || !token) {
  throw new Error('Set the target space, environment, root component, output path, and CMA_TOKEN');
}
if (!['flinkly.com', 'contentful.com', 'eu.contentful.com'].includes(domain)) {
  throw new Error('Choose the Contentful domain matching the target environment');
}
const base = `https://api.${domain}/spaces/${encodeURIComponent(spaceId)}` +
  `/environments/${encodeURIComponent(environmentId)}/components/`;
const trees = Object.create(null);
const complete = new Set();
const active = new Set();

async function captureNodes(nodes) {
  const captured = [];
  for (const node of nodes) {
    if (node.nodeType === 'Slot') {
      if (typeof node.slotId !== 'string') throw new Error('Slot is missing slotId');
      captured.push({ slot: node.slotId });
      continue;
    }
    if (!['Component', 'InlineExperienceFragment'].includes(node.nodeType) ||
        typeof node.id !== 'string') {
      throw new Error(`Unsupported authored node type: ${node.nodeType}`);
    }
    const urn = node.component?.sys?.urn;
    const link = typeof urn === 'string' && urn.match(
      /^crn:contentful:::experience:spaces\/([^/]+)\/environments\/([^/]+)\/components\/([^/]+)$/
    );
    if (!link) throw new Error(`Missing component ResourceLink on node ${node.id}`);
    const [, linkedSpace, linkedEnvironment, componentId] = link;
    if (!['$self', spaceId].includes(linkedSpace) ||
        !['$self', environmentId].includes(linkedEnvironment)) {
      throw new Error('Keep this mock fixture in one space and environment');
    }
    await captureComponent(componentId);
    const slots = {};
    for (const [slotId, children] of Object.entries(node.slots || {})) {
      if (!Array.isArray(children)) throw new Error(`Invalid slot ${slotId} on ${node.id}`);
      slots[slotId] = await captureNodes(children);
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
    // Insert the chosen root before its descendants so it is matched first.
    trees[id] = [];
    trees[id] = await captureNodes(component.componentTree);
  } else if (component.componentTree !== null) {
    throw new Error(`Component ${id} has no recognized implementation`);
  }
  active.delete(id);
  complete.add(id);
}

await captureComponent(rootId);
if (!trees[rootId]?.length) throw new Error('Choose a non-empty composed root component');
fs.writeFileSync(output, JSON.stringify(trees, null, 2) + '\n', { mode: 0o600 });
console.log(`Captured ${Object.keys(trees).length} composed trees into ${output}`);
JS
```

Apply the capture locally in the SDK checkout:

1. In `flinkly-repeated-sections.ts`, replace the entire `const trees` object with
   the generated JSON. Keep the `AuthoredNode` types and
   `addFlinklyComponentSourceMap` matcher. The filename is historical and does not
   constrain the target space. Update the snapshot comment to identify the chosen
   space, environment, and capture date.
2. In `override-response.ts`, replace the sample values in the
   `request.spaceId` and `request.environmentId` comparisons with the chosen IDs.
   Keep the `sourceMap` and development guards. Do not remove request scoping.
3. Keep these space-specific captures and credentials local. The shared branch is
   the starting point; an agent must not commit a user's captured data without
   authorization.

A Slot placeholder becomes `{ "slot": "<slotId>" }`; it is not a selectable authored
node. A component node becomes `{ "id": "<authoredNodeId>", "component":
"<referencedComponentId>", "slots": { ... } }`. Do not substitute delivered runtime
IDs for authored IDs. Capture supplied slot content under the component entity
that stores it, so the matcher preserves authoring ownership across composition.

## Build and install

After applying the capture, pack the SDK from the `experiences` root:

```sh
npx nx run adapter-react:pack
export INSPECTOR_SDK_DIR="$PWD"
```

In `exo-example-apps`, check out
[`max/exo-inspector-example`](https://github.com/contentful/exo-example-apps/tree/max/exo-inspector-example),
the branch for [PR #172](https://github.com/contentful/exo-example-apps/pull/172).
Keep `INSPECTOR_SDK_DIR` set to the absolute SDK checkout path in this shell.
From the example-app repository root, install all six local packages together:

```sh
node --input-type=module <<'JS'
import fs from 'node:fs';
import path from 'node:path';
if (!process.env.INSPECTOR_SDK_DIR) throw new Error('Set INSPECTOR_SDK_DIR first');
const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
manifest.overrides ??= {};
for (const name of ['react', 'live-preview', 'sdk-core', 'design', 'client', 'runtime']) {
  manifest.overrides[`@contentful/experiences-${name}`] =
    `file:${path.join(process.env.INSPECTOR_SDK_DIR, 'pkgs', `contentful-experiences-${name}-local.tgz`)}`;
}
fs.writeFileSync('package.json', JSON.stringify(manifest, null, 2) + '\n');
JS
npm install
```

Root overrides keep the app and shared components on one SDK instance. Keep the
resulting manifest and lockfile changes local. After recapturing, repack,
reinstall the updated archives, and restart the example app. If the app still uses
old code, inspect its installed `experiences-live-preview` package before
continuing; an old tarball invalidates the check.

Set `examples/nextjs-ctfl-marketing/.env.local` with actual values:

```dotenv
EXO_DOMAIN=<DOMAIN>
EXO_SPACE_ID=<SPACE_ID>
EXO_ENVIRONMENT_ID=<ENVIRONMENT_ID>
EXO_PREVIEW_ACCESS_TOKEN=<SPACE_ID>:<YOUR_PREVIEW_API_KEY>
```

Start the development app from the repository root:

```sh
npm run dev --workspace=nextjs-ctfl-marketing
```

## Open the inspector

Create or reuse an ExO preview configuration in the chosen space. Match its domain
and environment to the app configuration:

```text
http://localhost:3000/live-preview?spaceId=<SPACE_ID>&environmentId=<ENVIRONMENT_ID>&domain=<DOMAIN>
```

Use UI [PR #35352](https://github.com/contentful/user_interface/pull/35352). For a
Flinkly target, the hosted branch URL is:

```text
https://app.flinkly.com/spaces/<SPACE_ID>/environments/<ENVIRONMENT_ID>/components/<ROOT_COMPONENT_ID>?ui_version=max%2Fexo-inspector-ghost-nodes&ui_enable_flags=feature-exo-10-2026-live-preview-inspector-poc
```

If the hosted UI build is unavailable, check out PR #35352 in `user_interface`,
install dependencies, and run `npm run dev-staging` for Flinkly. Follow that
repository's local authorization instructions and open the chosen component on
port 3001 with the inspector flag. For other domains, use the matching UI backend
configuration. Open the editor on the same machine as the example app. It supplies
`preview_session_id`; opening the example route alone shows the waiting state.

## Verify and diagnose

- Confirm the preview WebSocket uses the chosen space/environment and requests
  `source_map=true`. Confirm rendered roots have unique `data-cf-node-id` values.
- Confirm the SDK's development guard matches the request and the captured
  topology matches the delivered component/slot structure. The SDK should add
  `sources`, `layers`, and runtime-keyed `nodes[*].path` before resolution, then
  include them in `canvasGeometryUpdated`.
- Expand the layers tree. Select an implementation descendant and check its
  highlighted bounds and the retained authored owner's properties. Select
  authored slot content and verify its own tree node, including repeated uses of
  the same composed component.
- Check alignment on resize and scrolling. Record observed counts from this
  fixture; do not reuse counts from a different space or capture.

An unmatched topology passes through unchanged. Recapture after adding, removing,
or reordering nodes. Reordering identical component kinds may retain the same
shape, so matching alone does not establish correct ownership; compare known
selected IDs with the authored tree. Content-property edits can remain live.

Use deployed Assemblies for structural-edit behavior, Duplicate/Undo,
saved-fragment identity, and backend source-map validation. The editor connection
indicator has sometimes timed out despite rendered content and geometry; verify
subsequent live updates separately.

## Files

- `flinkly-repeated-sections.ts`: example capture and source-path matcher; replace
  `trees` with the chosen component graph.
- `override-response.ts`: scope the mock to the chosen space/environment.
- `../preview-session.ts`: applies the override to incoming WebSocket updates.

# Shared inspector testing setup

This testing branch, `max/exo-inspector-testing-mocks`, is based on SDK
[PR #287](https://github.com/contentful/experiences/pull/287). It adds development-only
source-map paths for the shared Flinkly fixture. Use UI
[PR #35352](https://github.com/contentful/user_interface/pull/35352) with either
this branch or the deployed Assemblies setup in the
[proposal](https://contentful.atlassian.net/wiki/spaces/PROD/pages/7246577729/ExO+Live+Preview+Inspector+PoC+and+Proposal).

The app still receives real Preview Session content over its WebSocket. The mock
supplies only `extensions.sourceMap`. It does not replace authentication, the
Preview Session backend, or component definitions. It does not prove the
Assemblies source-map implementation or transport.

## Prerequisites

- Access to the repositories and their package registries, with the runtime
  required by each checkout.
- Access to Flinkly space `3ig419rcwm58`, environment `master`, including preview
  settings and the existing inspector components.
- Your own preview API key for that space and environment. Keep credentials in
  the example app's ignored `.env.local` file.

## Build and install

1. Check out `max/exo-inspector-testing-mocks` in `experiences`. From its root:

   ```sh
   npm ci
   npx nx run adapter-react:pack
   export INSPECTOR_SDK_DIR="$PWD"
   ```

2. In `exo-example-apps`, check out
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

   Root overrides keep the application and shared components on one SDK instance.
   Keep the generated manifest and lockfile changes local. No machine-specific
   dependency paths belong on the shared branch.

3. Set `examples/nextjs-ctfl-marketing/.env.local`:

   ```dotenv
   EXO_DOMAIN=flinkly.com
   EXO_SPACE_ID=3ig419rcwm58
   EXO_ENVIRONMENT_ID=master
   EXO_PREVIEW_ACCESS_TOKEN=3ig419rcwm58:<YOUR_PREVIEW_API_KEY>
   ```

4. Start the development app from the repository root:

   ```sh
   npm run dev --workspace=nextjs-ctfl-marketing
   ```

## Open the inspector

Use the existing preview configuration in the shared space, or configure the ExO
preview URL as:

```text
http://localhost:3000/live-preview?spaceId=3ig419rcwm58&environmentId=master&domain=flinkly.com
```

Open the UI build from PR #35352 on the same machine as the example app. Flinkly
can select its branch with `ui_version=max%2Fexo-inspector-ghost-nodes`. Enable
`feature-exo-10-2026-live-preview-inspector-poc`. The complete fixture URL is:

```text
https://app.flinkly.com/spaces/3ig419rcwm58/environments/master/components/inspectorRepeatedSections?ui_version=max%2Fexo-inspector-ghost-nodes&ui_enable_flags=feature-exo-10-2026-live-preview-inspector-poc
```

If that hosted UI build is unavailable, check out PR #35352 in `user_interface`,
install its dependencies, and run `npm run dev-staging`. Follow that repository's
local authorization instructions and open the same component on port 3001 with
the inspector flag enabled. The editor supplies `preview_session_id`; opening the
example route alone only shows the waiting state.

## Fixture and checks

`inspectorRepeatedSections` has three placements of `inspectorCtaSection`. Its
`body` slots contain an authored Flex with Paragraph and Link, a composed
`inspectorCtaCard` with two authored action Links, and an empty slot. The composed
section and card add their own Section, Flex, Heading, and Paragraph nodes.

- Expand the layers tree and inspect implementation descendants under each
  authored placement.
- Select a nested implementation node in the tree or preview. Its bounds should
  highlight while the properties panel retains the owning authored placement.
- Select authored slot content and check that it retains its own authored identity
  instead of selecting a neighboring placement.
- Check alignment when resizing and scrolling.

The mock activates only with `NODE_ENV=development`, `sourceMap: true`, space
`3ig419rcwm58`, and environment `master`. The example's `inspector: true` requests
that map automatically. Other spaces, environments, production builds, and
unmatched payload topologies pass through unchanged.

The authoring snapshot is fixed. Content-property edits can stay live, but adding,
removing, or reordering nodes requires recapturing `flinkly-repeated-sections.ts`.
Use the deployed Assemblies path for structural edits, Duplicate/Undo, and
saved-fragment identity validation. Do not use the mock as evidence for those
backend behaviors.

The existing editor connection indicator has sometimes timed out even while
content and inspector geometry render. A rendered preview alone does not verify
subsequent live updates.

## Files

- `flinkly-repeated-sections.ts`: captured authoring topology, slot ownership, and
  constructed source-map paths paired with live runtime IDs.
- `override-response.ts`: environment and request guards.
- `../preview-session.ts`: applies the override to incoming WebSocket updates.

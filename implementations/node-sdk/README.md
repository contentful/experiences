# Experiences Node SDK reference implementation

This standalone Express/EJS implementation consumes `@contentful/experiences-node`
from locally built npm tarballs. It has its own dependencies, configuration, and
tooling, outside the root npm workspaces. It follows Optimization's Node reference
flow: create a request facade, send a page event, optionally identify, then fetch
content through the runtime and render it with EJS. `GET /health` makes no API calls.

## Request flow

`GET /` calls the request facade's `page()` method and then fetches the reference
Experiences. `GET /?userId=charles` also calls `identify()` with that user ID and
`traits: { identified: true }`, matching Optimization. A fixed identify user ID
is acceptable; it is distinct from the API-issued profile ID.

Profiles come only from Experience API/XDA responses. The SDK carries the profile
between operations on the request facade. The app does not accept a profile-ID
input, persist profiles, or add cookies or sessions. Page/identify events are not
resent in content-fetch extensions. Requests assume `consent: true`, like the
Optimization reference; this is not a consent-management implementation.

The page shows the identify state and rendered Experience content. SDK exceptions
produce a short error response. The app does not inspect raw XDA responses;
application-level errors that the runtime does not surface remain an SDK limitation.
Responses are private/no-store and profiles remain request-local. The rate limiter
matches Optimization's 1000 requests per 30 seconds.

## Rendering and differences from Optimization

The EJS shell uses Optimization's CSS, including its font stack, 1040px width,
spacing, centered gray panels, and fixed 75dvh rows. Branding and the Experiences
section label reflect this SDK; the States/Identify interaction is unchanged.

Experiences returns nested plans instead of CDA entries. The recursive `nodes.ejs` partial
renders this space's title, Rich Text description, optional collection
records, and slot children. Both delivered node types use those same fields.
The SDK owns resolution; the template uses its resolved props and does not look up
the management export. Rich Text documents are passed directly to Contentful's
HTML renderer at the same version Optimization uses. Text and attributes use
ordinary EJS escaping. There is no diagnostic UI or custom Rich Text handling.

The existing `npm run mocks:generate:ctfl:types` command generates declarations
from the local space export and copies them to `src/contentful-generated.d.ts`.
Do not edit that copy. Its current output describes CDA entries, not the Experience
component/template properties, so those declarations are not imported by this app.
The app uses the SDK's `PortableRenderPlan` type; no local content interfaces are
maintained. The installed generator is 3.0.1 and produces only CDA declarations;
running it requires Node 24 or later. Custom Experience type generation is outside this task’s scope.

## Prerequisites

- Node.js 24 or later for repository tooling, including content-type generation.
  The standalone app declares Node.js 22.13 or later. Validation uses Node 24.15
  and npm 12.0.2.
- The repository's root dependencies installed with `npm ci`.

## Setup

Run from the repository root:

```sh
npx nx run implementation-node-sdk:setup
```

Nx builds, checks, and packs the Node SDK's local dependency chain, then installs
this app's dependencies and prepares the local environment file. Installation uses npm with
workspace participation, lifecycle scripts, and package-lock generation disabled.
It removes only this app's `node_modules` before installing, so rebuilt tarballs
are refreshed even when their names and versions are unchanged. This follows
Optimization's fresh local-artifact install workflow using npm and Nx.

Setup creates `.env` from `.env.example` only when the file is missing. Populate
this implementation's `.env` with `SPACE_ID`, `ENVIRONMENT_ID`, and `CDA_TOKEN`.
Set `LOCALE` if different from `en-US`.
Workers may gather these values from `lib/mocks/.contentfulrc.json` and
`lib/mocks/.env` during setup. The app and its launch commands use only the local
`.env`; they never read those source files. Do not copy the management token.
Keep real credentials out of `.env.example` and Git.

The default Experience IDs are fixed in source, matching Optimization's approach
and shared by all reference implementations:

- `6fQzPrHjFX25yTwi2Ic5gs` — Coded Experience
- `6fm371os680MYgg0XThK2S` — Composed Experience

Optionally set comma-separated `EXPERIENCE_IDS` in this implementation's `.env`
to replace that list. An absent or blank value uses the defaults. These are
content IDs; profile IDs continue to come only from the APIs through the SDK.

After SDK changes, refresh the installed artifacts:

```sh
npx nx run implementation-node-sdk:install
```

Existing `.env` values are preserved. Direct third-party dependencies are pinned;
transitive registry dependencies are resolved on each install, so this development
workflow does not provide lockfile-level reproducibility. npm may generate installation metadata inside `node_modules`; no lockfile is committed for this app.

## Running locally

```sh
npx nx run implementation-node-sdk:dev         # foreground; Ctrl-C stops it
npx nx run implementation-node-sdk:serve       # PM2 background process
npx nx run implementation-node-sdk:status
npx nx run implementation-node-sdk:logs -- --lines 20 --nostream
npx nx run implementation-node-sdk:restart
npx nx run implementation-node-sdk:serve:stop  # deletes only this app's process
```

The default app URL is `http://localhost:3100/`; health is at `/health`. Set `PORT` in the local
`.env` to change it. Both launch paths load that same file. The server binds to
loopback. PM2 uses the name `experiences-node-sdk-app`. Run only one checkout with
that process name at a time. Stop deletes that named process; PM2 reports an error
if it is already absent. Status, logs, and stop use the installed PM2 CLI directly.

These commands use the app's local tools. No mock server or E2E tooling is started
or installed. Running from the app directory is also supported, for example
`npm run dev` or `npm run typecheck`.

The repository also provides `npm run pm2:list`, `npm run pm2:logs`,
`npm run pm2:stop:all`, and `npm run pm2:delete:all`, matching Optimization.
These operate on the selected PM2 home; the `all` commands affect every process
there. Use `implementation-node-sdk:serve:stop` to stop only this app.

## Validation and cleanup

```sh
npx nx run implementation-node-sdk:typecheck
npx nx run implementation-node-sdk:lint
npx nx run implementation-node-sdk:clean
```

The app uses ordinary package scripts for its local tools, with Nx coordinating
them. There are no implementation-owned runner or verification scripts. Isolation
is demonstrated by installing and running a copy outside the repository.

`clean` removes only `dist` and `coverage`; it preserves `.env`, dependencies, and
processes. Root build/test/lint/typecheck commands exclude implementations, so a
root-only install does not require this app to be set up. Use Nx selection for
implementation-wide work:

```sh
npx nx run-many -t setup --projects=tag:scope:implementation
npx nx run-many -t typecheck,lint --projects=tag:scope:implementation
```

## Troubleshooting

- Missing installation or an outdated archive: run the root `setup` command.
- Missing local `.env`: copy `.env.example`, then populate the local settings.
- A port conflict: choose another `PORT`; do not stop unrelated processes.
- For a copy outside the repository, preserve the relative archive layout:
  `implementations/node-sdk` and `pkgs` under a common directory. Install with
  `npm install --workspaces=false --package-lock=false --ignore-scripts` inside the
  copied app, then use its local npm scripts. Nx and root dependencies are not
  required to run or check that configured copy.

## Related

- [Node SDK](../../packages/node/README.md)
- [Local package artifacts](../../README.md#local-npm-artifacts)

# Experiences Node + Web SDK reference implementation

This standalone Express/EJS application consumes locally packed public
`@contentful/experiences-node` and `@contentful/experiences-web` packages. It has its
own dependencies and tools and stays outside root npm workspaces.

The current implementation is the **accepted Phase 2 foundation**.
Home and Page Two serve a shell and ordinary document links. The Web UMD script
loads without constructing an SDK. There is no Experience fetching/rendering,
state handoff, browser activation, tracking, consent/identity handling, client
navigation or visitor action yet. `/health` checks local process liveness only;
it makes no API calls and does not establish upstream readiness.

The checkout-local [implementation plan](../../tmp/node-sdk-web-sdk-reference-implementation-plan.md)
defines the accepted design and phase gates. Phase 2 is accepted and Phase 3 is
authorized. The intended integration renders Experiences on Node, then hydrates
final profile state on Web while retaining the initial HTML. The committed-server
event flow and XDA limitations in that plan remain authoritative.

## Setup and refresh

Use Node 24 for repository tooling (validated with Node 24.15.0 and npm 12.0.2).
The standalone manifest declares Node >=22.13.0, matching the sibling references.
Start with root dependencies installed using the repository's `npm ci` workflow.
Run these commands from the repository root:

```sh
npx nx run implementation-node-sdk-web-sdk:setup
npx nx run implementation-node-sdk-web-sdk:dev
```

`setup` builds/checks/packs **both** Node and Web dependency chains, installs this
app through `scripts/install-implementation.ts`, and builds browser assets.
Installation replaces only this app's `node_modules`, disables workspaces,
lifecycle scripts and lockfile generation, and creates `.env` from `.env.example`
only when missing. Existing `.env` values survive installation/build/cleanup.
Direct third-party dependencies reuse exact pins from the sibling manifests.
Registry transitive dependencies resolve on each install; this development
workflow does not provide lockfile-level reproducibility.

After SDK source/artifact changes, run `setup` again. For separate steps:

```sh
npx nx run implementation-node-sdk-web-sdk:install
npx nx run implementation-node-sdk-web-sdk:build
```

`install` packs both chains and refreshes the installed archives. `build` uses only
already installed packages; it never installs. Archives use stable `pkgs/*-local.tgz`
aliases with app-local overrides for Client, Runtime and Core. There are no source
aliases or imports from internal SDK packages. The application has no dependency
on the adjacent Optimization checkout or its reference apps.

## Local configuration

Setup copies placeholder-only `.env.example` when `.env` is absent. The shell can
run with those nonempty placeholders because Phase 2 makes no upstream requests.
Replace them with appropriate space and public delivery credentials before later
live integration. Do not put credentials in `.env.example` or Git.

| Setting          | Meaning / default                                                   |
| ---------------- | ------------------------------------------------------------------- |
| `SPACE_ID`       | Required nonempty Contentful space ID                               |
| `CDA_TOKEN`      | Required nonempty delivery token suitable for browser exposure      |
| `ENVIRONMENT_ID` | `master` when absent or blank                                       |
| `LOCALE`         | `en-US` when absent or blank                                        |
| `EXPERIENCE_IDS` | Optional comma-separated IDs; absent/blank uses the shared defaults |
| `PORT`           | Integer 1–65535; default `3300`                                     |

The default Experience IDs are `3fLAdFb3BYAuImRhcW8k4t` (Coded),
`4WzbgzPQHa9Tr2ffbOU8p7` (Composed), and `7u2eP09B4BIBToH8UwSHck`
(Personalized Composed). The config resolves/deduplicates IDs without fetching.

`src/config.ts` parses only this app's `.env` using dotenv. It does not merge
`process.env` or fall back to sibling/mock configuration. `PORT` overrides belong
in this file. The explicit public projection contains only `SPACE_ID`,
`ENVIRONMENT_ID`, `CDA_TOKEN`, `LOCALE`, and resolved `EXPERIENCE_IDS`.
The Phase 2 shell serializes no runtime configuration or handoff; safe bootstrap
serialization accompanies actual server integration in Phase 3. Never copy
management/preview tokens or expose unrelated settings. No values are baked into
browser assets. Runtime configuration does not select alternate SDK endpoints.

## Run and stop

The default address is [http://localhost:3300](http://localhost:3300), bound to
`127.0.0.1`. Use `localhost` consistently for later browser continuity checks.
The explicit document routes are `/` and `/page-two`; health is `/health`.
Unknown routes and missing assets return 404. GET and HEAD are supported;
other methods return 405. Responses use private/no-store caching.

```sh
npx nx run implementation-node-sdk-web-sdk:dev         # foreground; Ctrl-C stops it
npx nx run implementation-node-sdk-web-sdk:serve       # PM2 background
npx nx run implementation-node-sdk-web-sdk:status
npx nx run implementation-node-sdk-web-sdk:logs -- --lines 20 --nostream
npx nx run implementation-node-sdk-web-sdk:restart
npx nx run implementation-node-sdk-web-sdk:serve:stop
```

`dev` and `serve` build installed browser assets before launch. Both read the same
local `.env`. PM2 commands target only `experiences-node-web-sdk-app`; stop deletes
that named process and reports an error when absent. Run only one checkout with
that name at a time. Choose another local `PORT` if occupied; preserve unrelated
processes. Do not use global PM2 stop/delete commands for this app.

## Build and validation

```sh
npx nx run implementation-node-sdk-web-sdk:build
npx nx run implementation-node-sdk-web-sdk:lint
npx nx run implementation-node-sdk-web-sdk:typecheck
npx nx run implementation-node-sdk-web-sdk:clean
```

Root aggregate checks exclude implementations. Each target invokes ordinary local
npm scripts, so app-directory `npm run build`, `npm run lint`, `npm run typecheck`
and `npm run dev` also work. `clean` removes only generated `public/dist`, leaving
configuration, dependencies and processes intact. TypeScript checks `src/**/*.ts`
and `scripts/**/*.ts`; ESLint also covers authored `public/js/**/*.js` when present.
No authored browser JavaScript exists yet. EJS and browser content accesses are
not validated by the server typecheck.

With the app running, directly inspect both document routes, `/health`,
`/css/theme.css`, `/dist/contentful-experiences-web.umd.js` and `/dist/rich-text.js`.
Health returns `ok`; missing assets and unknown routes must return 404.
No automated tests, verification harnesses, mocks, fixtures or test-only hooks
are included. Installed public exports/types and the copied UMD distribution
are part of Phase 2's artifact checks; shell success says nothing about live SDK
or service behavior. Current results are recorded in the local plan.

## Files and provenance

- `src/app.ts`: Express/EJS, explicit routes, health, public-only static hosting,
  rate limiting (1000 requests per 30 seconds), generic errors and signal shutdown.
  Dot paths, traversal and public symlinks resolving outside `public/` are rejected.
- `src/config.ts`: implementation-local parsing, validation, defaults and public
  configuration allowlist. No SDK instance exists in the foundation.
- `src/index.ejs`: shared shell, route title and semantic document navigation.
- `scripts/build-assets.ts`: copies the installed Web package's complete `dist`
  unchanged to generated `public/dist`, then uses Vite with `emptyOutDir: false`
  to build `rich-text.js`. No environment settings or source checkout paths are
  used as bundle inputs.
- `scripts/rich-text.ts`: Contentful Rich Text HTML renderer and the public Web
  `tracking-attributes` helper exports, ready for later renderer integration.
- `public/css/theme.css`: local copy of the Experiences Web theme, retaining
  Optimization commit `59add9d6ebff503b9033a59a2eee0149d4b4e925` provenance and MIT
  license. Its source was `lib/e2e-web/src/theme.css`; this is stylesheet provenance,
  not a testing dependency. No adjacent checkout is needed at build/runtime.

The pinned Optimization hybrid reference
`70dfa7fba9b62f0920b712b3da261a412436b4b7` supplies the structural comparison;
Experiences retains this repository's npm/Nx, Vite, ESLint and scoped PM2 workflow.
Existing [Node](../node-sdk/README.md) and [Web](../web-sdk/README.md) references
remain independent. SDK contracts are documented in the public
[Node](../../packages/node/README.md) and [Web](../../packages/web/README.md) READMEs.

If dependencies/assets are missing or stale, rerun setup. If `.env` is missing,
copy `.env.example` locally. A standalone copy must preserve the relative
`implementations/node-sdk+web-sdk` and `pkgs` layout; install there with
`npm install --workspaces=false --package-lock=false --ignore-scripts`, then use
its local npm commands. Nx/root dependencies are unnecessary for building,
checking or running an already configured copy.

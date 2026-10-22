# Experiences Web SDK reference implementation

This standalone application consumes the locally packed `@contentful/experiences-web`
SDK as a classic UMD script. Browser application files are vanilla JavaScript;
the HTTP server and asset builder use TypeScript. The app lives outside the root
npm workspaces and declares its own dependencies and tools.

The current foundation provides Home and Page Two, a Utilities placeholder, and
an empty Tracking sidebar. Navigation supports direct URLs and back/forward.
Controls are disabled: this phase does not construct an SDK instance, fetch
Experience content, identify visitors, change consent, or send events.

## Setup and local commands

Use Node >=22.13.0 and the root dependencies installed with `npm ci`.
From the repository root:

```sh
npx nx run implementation-web-sdk:setup
npx nx run implementation-web-sdk:dev
```

Setup builds and packs Web and its local dependency chain through the maintained
Nx targets, installs this app with `scripts/install-implementation.ts`, then builds
browser assets. The helper replaces only this app's `node_modules`, disables
workspace participation, install lifecycle scripts, and package-lock generation,
and creates `.env` from `.env.example` only when missing. Existing `.env` values
survive setup, installation, and asset cleanup. Populate the local file before
starting the server.

After SDK source changes, run setup again to rebuild/repack and refresh installed
artifacts. `build` alone uses the already installed artifacts and does not install:

```sh
npx nx run implementation-web-sdk:install
npx nx run implementation-web-sdk:build
npx nx run implementation-web-sdk:typecheck
npx nx run implementation-web-sdk:lint
npx nx run implementation-web-sdk:clean
```

`install` refreshes dependencies after packing; `setup` also builds assets. `clean`
removes only generated `public/dist` and coverage. Root aggregate checks exclude
implementations; use the explicit targets above. App-directory `npm run` commands
also work and resolve locally installed tools. Direct third-party dependencies
are pinned; registry transitive dependencies resolve on each install, following
the existing implementation workflow without a committed app lockfile.

The default URL is `http://localhost:3200/`, with Page Two at `/page-two` and health
at `/health`. Both foreground and background launches read the same app-local
`.env`; `PORT` comes from that file, defaulting to 3200. The server binds to
`127.0.0.1`. Health returns local process status and makes no upstream requests.

```sh
npx nx run implementation-web-sdk:serve
npx nx run implementation-web-sdk:status
npx nx run implementation-web-sdk:logs -- --lines 20 --nostream
npx nx run implementation-web-sdk:restart
npx nx run implementation-web-sdk:serve:stop
```

PM2 manages only `experiences-web-sdk-app` through the local tsx CLI. Stop deletes
that named process and reports an error if absent. Run one checkout with that
name at a time. Avoid global PM2 stop/delete commands when managing this app.

## Environment and direct browser delivery

Configure `SPACE_ID`, `ENVIRONMENT_ID`, `CDA_TOKEN`, optional `LOCALE` (default
`en-US`), optional comma-separated `EXPERIENCE_IDS`, and `PORT`. Blank or absent
`EXPERIENCE_IDS` uses the shared reference defaults:

- `3fLAdFb3BYAuImRhcW8k4t` — Coded Experience
- `4WzbgzPQHa9Tr2ffbOU8p7` — Composed Experience
- `7u2eP09B4BIBToH8UwSHck` — Personalized Composed Experience

During initial local setup, authorized delivery values may be copied from the
Node reference's `.env`. Preserve an existing Web `.env`; never copy management
or preview credentials. Launch commands read only this app's configuration.

The server parses `.env` with dotenv, falling back to the credential-free
`.env.example`, and fails with a setting name when required values are missing.
It injects exactly `SPACE_ID`, `ENVIRONMENT_ID`, `CDA_TOKEN`, `LOCALE`, and resolved
`EXPERIENCE_IDS` as `window.ENVIRONMENT` into private/no-store HTML. JSON escapes
`<` before insertion into the script element. No environment values are baked
into source or generated assets. Environment files are ignored by Git and cannot
be served by the public-file server.

`CDA_TOKEN` is intentionally browser-visible. Use a delivery credential scoped for
that use with an appropriate endpoint CORS policy. The accepted transport is
direct browser delivery using the SDK's default live endpoints and
`delivery: { accessToken: window.ENVIRONMENT.CDA_TOKEN }`, with the injected space,
environment and locale. There is no delivery proxy, alternate endpoint selector,
or server-side SDK. Browser HTTP CORS preflight is separate from the Experience
API's noncommitting Personalization preflight; this app implements neither a
preflight workflow nor Node handoff.

## Files, assets, and source provenance

- `server.ts`: lightweight Node HTTP server, public-only files, MIME types, GET/HEAD,
  API-free health, safe configuration injection, extensionless SPA fallback.
  Missing assets return 404; dot paths, traversal and public symlinks escaping
  the public directory are rejected. Other methods return 405.
- `scripts/build-assets.ts`: cleans `public/dist`, copies the installed Web
  package's complete dist (including UMD/source map), then uses Vite's library
  build to create `rich-text.js` from `scripts/rich-text.ts` with
  `emptyOutDir: false`. Rich Text is prepared for later rendering; it is not
  invoked by the foundation.
- `public/index.html` and `public/js/app.js`: common shell and route templates.
  Stable navigation, utility, and sidebar `data-testid` conventions follow the
  Optimization reference. Experience-specific placeholders replace entry/Web
  Component semantics. No visitor or tracking modules are present yet.
- `public/css/theme.css`: locally vendored Optimization theme from commit
  `59add9d6ebff503b9033a59a2eee0149d4b4e925`, `lib/e2e-web/src/theme.css` (MIT).
  This is stylesheet provenance, not a dependency on its testing package.
  Excluded feature styles are removed. A small narrow-screen rule stacks the
  sidebar above the scrollable main area because the reference's fixed 340px
  sidebar leaves insufficient phone-width content space.

Server, template navigation and installed-asset preparation patterns also derive
from that commit's `implementations/web-sdk`. npm/Nx, scoped PM2, ESLint, Prettier,
local tarball overrides and the shared installer follow Experiences tooling.
Vite bundles only the app Rich Text dependency; Web's accepted Rslib distribution
is consumed unchanged. No adjacent checkout is needed to build or run this app.

## Validation and scope

Use build, local lint/typecheck, actual artifact inspection and direct browser
checks. TypeScript checks `server.ts` and `scripts/**/*.ts` only. Browser JavaScript
is linted; TypeScript does not validate its content property accesses or live
binding shapes. No handwritten content-type substitute or custom generator is
included.

Operation and verification use live services only. Do not introduce mocks,
fixtures, simulated upstreams, E2E tests, or E2E infrastructure. Retain stable
selectors for compatibility. No Live Updates or Live Preview is included.
Content fetching/rendering and visitor actions require the next accepted phase;
tracking behavior requires its own phase. An event-stream notification denotes
an event attempt, not admission or successful delivery. XDA is currently unstable
and may need multiple attempts; HTTP 200 alone does not prove personalization.

The durable checkout-local plan at `tmp/web-sdk-reference-implementation-plan.md`
records current phase authorization and validation evidence. Stop for Phase 4
acceptance before implementing Phase 5.

## Troubleshooting

- Missing/outdated assets: run setup after SDK changes, or build after app asset changes.
- Missing settings: populate this app's ignored `.env`; do not edit `.env.example`
  with credentials.
- Port conflict: choose a different local `PORT`, without stopping another app.
- A standalone copy must preserve relative `implementations/web-sdk` and `pkgs`
  locations. Install with `npm install --workspaces=false --package-lock=false
--ignore-scripts` there, then use local npm commands; no root tool is needed to
  build/check/run an already configured copy.

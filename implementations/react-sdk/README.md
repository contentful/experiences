# Experiences React SDK reference foundation

This private standalone React/Vite application is the permanent Phase 3 reference
shell. It consumes locally packed SDK artifacts outside the root npm workspaces.
Home (`/`) and Page Two (`/page-two`) use ordinary document links, including direct
navigation and browser back/forward. The Web reference's theme, Tracking sidebar,
Utilities area and split content layout establish the presentation for subsequent
integration work.

The current shell creates no SDK runtime, loads no Experience content, registers
no renderers or tracking roots, and submits no events. Utilities and content areas
explain their current availability; they contain no inactive demonstration buttons,
loading indicators or fabricated state. Credentials are unnecessary to build and
start this foundation. Rendering arrives in Phase 4, runtime ownership/hooks and
controls in Phase 5, and managed content/navigation/preview in Phase 6, in this same
application. See the [implementation plan](../../tmp/react-next-runtime-implementation-plan.md#phase-3-establish-packages-and-the-react-reference-foundation)
and [accepted design](../../tmp/react-next-runtime-phase-1-design.md).

## Setup and local commands

Use Node >=22.13.0 and installed root dependencies. From the repository root:

```sh
npx nx run implementation-react-sdk:setup
npx nx run implementation-react-sdk:dev
```

`install` packs React and Web through their maintained Nx targets and packs the
existing optional Preview artifact with `package-tools:pack-preview`. The shared
`scripts/install-implementation.ts` helper installs this app with workspace
participation, install scripts and lockfile generation disabled. It refreshes only
this app's `node_modules` and copies `.env.example` to `.env` only when absent.
`setup` runs `install` and then builds the shell. Stop this app before refreshing
dependencies; repeat setup after SDK artifact changes.

Root `npm run implementation:install` prepares every registered reference,
including this app, through `nx run-many -t setup --projects=tag:scope:implementation`.
Use the scoped setup target above when refreshing only React.

```sh
npx nx run implementation-react-sdk:install
npx nx run implementation-react-sdk:build
npx nx run implementation-react-sdk:lint
npx nx run implementation-react-sdk:typecheck
npx nx run implementation-react-sdk:clean
```

`build` uses installed artifacts without installing or packing. `typecheck` checks
browser TSX and Node/tooling separately. `clean` removes only generated `dist` and
coverage; it preserves source assets, dependencies and `.env`. App-directory
`npm run` commands resolve the locally installed tools. Direct third-party versions
are pinned; transitive registry dependencies resolve through the existing
standalone install workflow without an app lockfile. Root aggregate checks exclude
implementation projects; use these explicit checks. The Build CI job runs aggregate
reference setup, then explicitly runs
`npx nx run-many -t build,lint,typecheck --projects=tag:scope:implementation`,
including this app.

The default address is `http://localhost:3400/`. Both foreground `dev` and PM2
launches build with Vite and serve the generated shell through the same Node HTTP
host. This follows the Web reference's build-before-start convention; `dev` does
not provide Vite hot reload. The host binds to `127.0.0.1`, serves only `dist`, and
exposes API-free process liveness at `/health`. Extensionless paths receive the
shell, with an unknown-route message for paths other than Home/Page Two. Missing
assets and `/api` return 404, dot paths/traversal are rejected, and only GET/HEAD
are supported. Health makes no service requests and does not establish SDK readiness.

```sh
npx nx run implementation-react-sdk:serve
npx nx run implementation-react-sdk:status
npx nx run implementation-react-sdk:logs -- --lines 20 --nostream
npx nx run implementation-react-sdk:restart
npx nx run implementation-react-sdk:serve:stop
```

PM2 manages only `experiences-react-sdk-app` through this app's local tsx CLI.
Stop deletes that named process and reports an error if absent. Use one checkout
with that process name at a time. `dev`, `serve` and `restart` build before launch;
a failed build prevents restart. Avoid global PM2 stop/delete commands.

## Local configuration

The host parses only this app's `.env`, falling back to the credential-free
`.env.example`. Existing `.env` values survive setup/build/clean. It never reads
another reference's environment file or spreads `process.env`. `PORT` is local
hosting configuration, defaulting to 3400, and must be an integer in 1–65535.

The complete public allowlist is `SPACE_ID`, `ENVIRONMENT_ID`, `CDA_TOKEN`, `LOCALE`
and resolved `EXPERIENCE_IDS`. The first and third default to empty strings;
environment defaults to `master` and locale to `en-US`. These are configuration for
the later content integration, not evidence that a runtime is connected. The host
injects them as `window.ENVIRONMENT` in private/no-store HTML, escaping `<` in JSON.
Vite environment loading and automatic environment exposure are disabled. No
configuration values are baked into the JavaScript assets, and environment files
cannot be served from the output-only host.

`CDA_TOKEN`, when configured, is intentionally browser-visible and must be a Delivery
credential approved and scoped for that use. Do not place management credentials
or server-only preview tokens in the public allowlist. Preview configuration and
initialization are introduced with the later preview integration; the foundation
does not read preview settings or open a connection.

An absent or blank comma-separated `EXPERIENCE_IDS` uses the same defaults as Web:

- `3fLAdFb3BYAuImRhcW8k4t` — Coded Experience
- `4WzbgzPQHa9Tr2ffbOU8p7` — Composed Experience
- `7u2eP09B4BIBToH8UwSHck` — Personalized Composed Experience

Local overrides are trimmed and deduplicated while preserving order. IDs are
optional configuration, not rendered content or manually supplied visitor profile
IDs. The later Home presentation uses all three automatically and the first
manually; Page Two uses the last automatically and the first manually.

## Package boundaries and source

`package.json` declares the public React and Web local tarballs, overrides their
Client/Runtime/Core/Design chains to local archives, and installs the unchanged
Preview artifact as an optional dependency for eventual lazy initialization. There
is no Next dependency, workspace source alias or adjacent Optimization dependency.
The shell imports only React/React DOM and local presentation/CSS, so none of the
SDKs, Preview code or protocol dependencies enter its bundle or load at startup.

Browser rendering uses the public `@contentful/experiences-react/client` entry;
static/server integration uses `@contentful/experiences-react/server` where
applicable. The foundation imports neither entry because Experience rendering
arrives in Phase 4. Preview integration must use
the frozen package's public exports and Runtime's supported initializer; see
[Runtime preview limits](../../packages/runtime/README.md#optional-runtime-live-preview).

- `src/App.tsx`, `src/main.tsx`, `index.html`: React shell, route labels, normal
  links, title/active-link updates, foundation descriptions and local assets.
- `src/theme.css`: unchanged Web theme plus a provenance note, vendored from
  Optimization commit `59add9d6ebff503b9033a59a2eee0149d4b4e925`,
  `lib/e2e-web/src/theme.css` (MIT), retaining the license and Web's narrow-layout
  adaptations. The testing package is stylesheet provenance only.
- `server.ts`, `public-config.ts`: Web reference hosting/safe projection patterns,
  adapted to Vite output and credential-optional startup.
- `vite.config.ts`, TypeScript/ESLint configs, `project.json`: local build/check
  tooling and scoped Nx lifecycle. Generated assets stay inside this app's `dist`.

Use scoped build/lint/typecheck and direct inspection of this maintained app for
validation. No network unit tests, MSW, E2E tooling, simulated services or temporary
consumers belong to this foundation. Shell inspection establishes local
presentation/hosting only; it cannot demonstrate later rendering, personalization,
consent, tracking or preview behavior.

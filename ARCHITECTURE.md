# ARCHITECTURE.md — structure of the `contentful/experiences` workspace

How this monorepo is wired: which packages exist, how they depend on each other,
what turns source into a published artifact, and which of those edges are
enforced by tooling versus by review.

This document is deliberately structural. It does not re-explain the runtime
pipeline or the API-shape rationale:

| For…                                                     | Read                                 |
| -------------------------------------------------------- | ------------------------------------ |
| How a customer uses the SDK                              | [README.md](./README.md)             |
| Why the API looks the way it does, gotchas, common tasks | [AGENTS.md](./AGENTS.md)             |
| How to set up, check, and submit a change                | [CONTRIBUTING.md](./CONTRIBUTING.md) |
| Why a specific structural decision was made              | [docs/ADRs/](./docs/ADRs/)           |

---

## System boundary

The repo owns exactly one thing: turning an Experience payload into a rendered
tree in a customer's app. It owns neither end of that sentence.

```
 ┌─ upstream, not in this repo ──────────────────┐
 │ Experience Delivery API (XDA)                 │
 │ @contentful/experience-delivery  (generated)  │
 └───────────────────────┬───────────────────────┘
                         │ HTTP + generated client
 ┌───────────────────────▼───────────────────────┐
 │ THIS REPO — packages/*                        │
 │   fetch → resolve → runtime-neutral plan      │
 │                   → framework render          │
 └───────────────────────┬───────────────────────┘
                         │ npm package + peer framework
 ┌───────────────────────▼───────────────────────┐
 │ downstream, not in this repo                  │
 │ Customer app + customer design system         │
 └───────────────────────────────────────────────┘
```

Two consequences of that boundary shape recur throughout the layout below:

- **The payload contract is upstream.** `@contentful/experience-delivery` is a
  generated client pinned to an exact version
  (`packages/client/package.json`), and it is reachable from exactly one
  package.
- **The rendering target is downstream.** Every framework arrives as a
  `peerDependency`, never a dependency — see the peer ranges in
  `packages/adapter-*/package.json`.

---

## Package graph

Ten libraries live under `packages/`. `core` and `design` have no package
dependencies. Client is the sole generated Delivery edge; Runtime imports
Client and owns Optimization integration. Node and Web are sibling leaves over
Runtime, Client, and Core. Live Preview is a separate public data source that
the framework adapters also depend on. Every edge below is a `dependencies`
entry in the corresponding `package.json`.

| Nx project        | Directory                  | npm name                               | Depends on                                                     | Public? |
| ----------------- | -------------------------- | -------------------------------------- | -------------------------------------------------------------- | ------- |
| `core`            | `packages/core`            | `@contentful/experiences-sdk-core`     | —                                                              | no      |
| `design`          | `packages/design`          | `@contentful/experiences-design`       | —                                                              | no      |
| `client`          | `packages/client`          | `@contentful/experiences-client`       | `core`, generated `@contentful/experience-delivery`            | no      |
| `runtime`         | `packages/runtime`         | `@contentful/experiences-runtime`      | `core`, `client`, Optimization API client, `es-toolkit`, `zod` | no      |
| `node`            | `packages/node`            | `@contentful/experiences-node`         | `core`, `client`, `runtime`                                    | yes     |
| `web`             | `packages/web`             | `@contentful/experiences-web`          | `core`, `client`, `runtime`                                    | yes     |
| `live-preview`    | `packages/live-preview`    | `@contentful/experiences-live-preview` | `core`, `client`                                               | yes     |
| `adapter-react`   | `packages/adapter-react`   | `@contentful/experiences-react`        | `core`, `design`, `client`, `runtime`, `live-preview`          | yes     |
| `adapter-svelte`  | `packages/adapter-svelte`  | `@contentful/experiences-svelte`       | `core`, `design`, `client`, `runtime`, `live-preview`          | yes     |
| `adapter-angular` | `packages/adapter-angular` | `@contentful/experiences-angular`      | `core`, `design`, `client`, `runtime`, `live-preview`          | yes     |

The graph is acyclic. Framework adapters are leaves and do not depend on one
another. A future adapter adds a new leaf without changing the existing Core,
Client, or Runtime ownership boundaries.

**Directory name, Nx project name, and npm package name are three separate
identifiers** (`packages/adapter-react` / `adapter-react` /
`@contentful/experiences-react`), declared in `project.json#name` and
`package.json#name`. Git tags use the Nx project name (`design@0.7.8`), so the
Nx name is what appears in release history.

**Internal dependency versions are exact, not ranges.** Those pins are
machine-written on every release, not hand-maintained; see
[the versioning ADR](./docs/ADRs/2026-08-25-independent-package-versioning-with-nx-release.md).
During local development they are irrelevant: npm workspaces symlink
`packages/*` into the root `node_modules`, so every import resolves to the
sibling working copy regardless of the declared version.

### Design-property boundaries

`core` owns design-property and token resolution while building a render
plan. `packages/design` is independent and contains only the CSS-property
recognition helpers (`CSS_PROPERTIES`, `isCssProperty`, and `toCssKey`) used by
the adapters' `toCss` utilities. The adapters re-export both sets of supported
utilities from their public entry points.

### The delivery-client edge

`packages/client` is the only package that may import
`@contentful/experience-delivery`, and it re-exports the pieces customers need
(`ContentfulViewDeliveryClient`, `NotFoundError`) from
`packages/client/src/index.ts` so the adapters can pass them through without
taking the dependency. The public adapter/free-function surface still supports
`fetchExperience(..., { client })`, `createClient`, and a raw delivery client.
Those are deliberately separate from Node/Web runtime construction: a runtime
takes `RuntimeDeliveryClientOptions` and constructs its own delivery clients.
The rationale is in AGENTS.md; the structural point is that this keeps `core` at
zero dependencies, which is the invariant every future adapter inherits.

### Core, Client, Runtime, Node, Web, and Live Preview responsibilities

`core` is genuinely dependency-free: it contains payload and render-plan types,
`resolveExperience`, diagnostics, and design-resolution helpers. It
does not own delivery transport, event construction, or connection state.

`client` owns generated Delivery integration, XDA-derived request types,
payload conversion, errors, and free fetch functions. It does not import
Runtime. `runtime` depends on Client's public boundary and owns the complete
`EventBuilder`, Optimization transport, event methods, handoff contracts, and
the lower-layer shared `ContentfulExperiences` base. Runtime, not Client,
declares the Optimization API client, `es-toolkit`, and `zod` dependencies.
Runtime constructors accept `RuntimeDeliveryClientOptions` configuration, then
construct and retain their own Delivery, optional Preview, and Optimization
clients; a caller cannot inject a pre-built delivery client. `accessToken` can
be the generated client's token supplier. It may be omitted only with an
explicit proxy host, which disables generated bearer auth and must supply
upstream auth itself. The shared runtime is stateless with respect to request
and browser state, takes resolver registrations per fetch/resolve call, and
requires its platform caller to provide the event channel. Event-only Node/Web
construction does not need a component registry.

`node` is the public Node-specific leaf over Runtime, Client, and Core. Its
process-long SDK instance retains stable configuration and reusable delivery
transports; `forRequest()` creates a request-local facade for fetch, resolve,
destination, and event operations. This keeps locale, resolve options, and
volatile event profile/context from crossing concurrent requests. `web` is a
sibling public leaf, not a subclass of Node. It owns mutable browser locale,
browser context providers, and a LocalStorage-persisted profile, and inherits
the shared runtime's trusted custom-endpoint and direct by-ID CPA preview
capabilities. Web enforces one live Experiences Web SDK instance per JavaScript
runtime; the shared Runtime and Node SDK have no singleton restriction.

Both leaves expose `identify`, `page`, and `track` through the Personalization
API and interaction methods through Analytics. Node's ordinary methods send
directly. Its `prepareRequestHandoff()` builds one identify/track/page batch
and sends a single Personalization `preflight: true` request without a Node
event commit. The resulting private handoff contains exact browser-visible
event bodies. Web validates scope and cache safety, hydrates state
imperatively, and admits a matching replay through Runtime's in-memory
Personalization queue; construction never replays. Repeated current
initializations join, route mismatches use ordinary current-page tracking,
and later visits remain trackable. Admission can precede HTTP completion and
retry can duplicate a request whose first result was ambiguous. Ordinary
online Personalization calls remain direct; offline ordinary Personalization
calls use the same in-memory queue. Web queues Analytics events in a separate
in-memory queue, adapted from Optimization's InsightsQueue, flushed at 25
events, every 30 seconds, on reconnect, and on page hide via the Beacon API; page hide
also forces a final Personalization attempt, and `queuePolicy.offlineMaxEvents` sets the
offline Personalization capacity.
Node sends immediately. There is no durable event persistence or Live Preview
event integration.
Events are consent-gated: consent is `{ events, persistence }`, undecided means
not granted, and until event consent is granted only `allowedEventTypes` are
sent. Web holds consent globally and stores it in LocalStorage; Node scopes it
to one `forRequest()` facade. Node drops initial inputs it may not send before preparing a handoff and
prepares nothing without a permitted page; Web admits an already prepared
batch whole, because it is replayed as previewed. No adapter or example is yet wired to the
paired handoff.
See the root [paired replay guide](./README.md#paired-server-to-browser-replay).

The current generated XDA client has no noncommitting preflight option for
content fetching. An ordinary XDA fetch with events may commit them; a separate
Personalization preflight does not render XDA content under uncommitted
mutations. Duplicate events from independently using those operations are
accepted until upstream preflight and its typed client support are integrated.
This work stream adds no placeholder API or duplicate-event workaround.

By-ID fetch options can carry first-class personalization with a profile id and
caller-built events; Client maps it to XDA's extension body, and Node proxies it
without retaining state.

For both public leaves, `environmentId` names the Contentful environment used
by by-ID Experience requests; it is distinct from the generated delivery
client's optional `environment` endpoint configuration. The runtime's `host`
option maps to that client's `baseUrl`; explicit `host` wins over generated-client
`environment`, which wins over the delivery or preview default. A tokenless
runtime host is an explicit proxy boundary: generated auth is disabled and the
proxy owns upstream credentials. A runtime token is sent to its configured
endpoint. On Web this is intentionally browser-visible only when token scope and
CORS make that safe; otherwise use the proxy. Raw-client `baseUrl` configuration
belongs only to the separate adapter/free-function paths. Direct CPA preview
fetches are separate from the Preview Session HTTP/WebSocket transport that
`live-preview` owns.

Framework-adapter barrels do not re-export Node's request facade. `live-preview`
remains the public framework-neutral Preview Session layer. It owns its HTTP
loading, WebSocket subscription, external-store state, and errors.

---

## Layering rules and where they live

| Rule                                                             | Encoded in                                                                                          | Enforced by                                                                    |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `core` has no dependencies                                       | `packages/core/package.json` (no `dependencies`)                                                    | review                                                                         |
| Only `client` reaches the delivery client                        | `packages/client/package.json`                                                                      | review                                                                         |
| Runtime owns event construction; Client owns Delivery            | `packages/runtime/src/*`, `packages/client/src/*`                                                   | review and package dependency inspection                                       |
| Client is runtime-neutral and request-stateless                  | `packages/client/src/*`                                                                             | review                                                                         |
| Node request state and volatile event context stay request-local | `packages/node/src/*`                                                                               | review and Node concurrency tests                                              |
| Web browser state and persisted profile stay browser-owned       | `packages/web/src/*`                                                                                | review plus browser and SSR import tests                                       |
| Frameworks are peers, never deps                                 | `packages/adapter-*/package.json`                                                                   | `publint`, in `adapter-angular`'s Nx `build` target                            |
| Adapters do not surface Node's request facade                    | `packages/adapter-*/src/index.ts`                                                                   | review                                                                         |
| Project scope for tags                                           | `project.json#tags` (`scope:adapter`, `scope:runtime-neutral`, `scope:sdk`, `layer:*`, `runtime:*`) | declared only — no `@nx/enforce-module-boundaries` rule in `eslint.config.mjs` |

The `tags` in each `project.json` are the seam for mechanical enforcement: the
vocabulary is already assigned consistently, but `eslint.config.mjs` does not
yet include the boundaries rule that would read it. Until it does, the boundary
rules above are review-time conventions, not build failures.

---

## Nx workspace topology

npm workspaces and the Nx project graph cover **different** sets of directories,
which is the single most surprising thing about this workspace.

`package.json#workspaces` is `["packages/*", "examples/*", "lib/mocks"]`, so
the example apps are symlinked into the workspace and consume the SDK packages
by name (`"@contentful/experiences-react": "*"` in
`examples/nextjs/package.json`).

But `.nxignore` excludes `examples`, and every plugin entry in `nx.json` is
scoped to `include: ["packages/**/*"]`. So:

- `npm run build` / `npm test` / `npm run lint` / `npm run typecheck` — each
  `nx run-many -t <target>` — touch **only** `packages/*`.
- `nx graph`, `nx affected`, and `nx release` do not see the example apps at
  all.
- The example apps have no `project.json` and are run directly from their
  own directories (`cd examples/nextjs && npm run dev`).

`implementations/` is the inverse. The reference implementations are **not**
npm workspaces: each installs locally packed SDK tarballs from `pkgs/`, so it
exercises the packages as they will be published. They **are** Nx projects,
tagged `scope:implementation`, and the root aggregate scripts exclude that tag
(`--exclude=tag:scope:implementation`). Run them through their explicit
`implementation-*` Nx targets or `npm run implementation:install`.
`examples/` is the customer-facing integration surface; `implementations/` is
for maintainers validating SDK behavior.

### Targets

`nx.json#targetDefaults` sets `cache: true` on `build`, `typecheck`, `test`, and
`lint`, and adds `dependsOn: ["^build"]` to `build` and `dependsOn:
["^typecheck"]` to `typecheck` — that is what makes `nx run-many -t build`
topological. Each package then declares its own target
commands in `project.json`, because the three adapters do not share a build tool:

| Package           | `build`                               | `test`                                                    |
| ----------------- | ------------------------------------- | --------------------------------------------------------- |
| `core`            | `tsup && emit-dual-dts`               | `vitest run`                                              |
| `design`          | `tsup`                                | `vitest run`                                              |
| `client`          | `tsup && emit-dual-dts`               | `vitest run`                                              |
| `runtime`         | `tsup && emit-dual-dts`               | `vitest run`                                              |
| `node`            | `tsup`                                | `vitest run`                                              |
| `web`             | `tsup && emit-dual-dts`               | `vitest run` **and** `vitest run -c vitest.ssr.config.ts` |
| `live-preview`    | `tsup`                                | `vitest run`                                              |
| `adapter-react`   | `tsup`                                | `vitest run`                                              |
| `adapter-svelte`  | `svelte-package -i src -o dist`       | `vitest run` **and** `vitest run -c vitest.ssr.config.ts` |
| `adapter-angular` | `ngc -p tsconfig.lib.json && publint` | `vitest run` **and** `vitest run -c vitest.ssr.config.ts` |

The separate browser/SSR test configs on Web, Svelte, and Angular keep browser
globals and framework client behavior out of the Node test environment. The
adapter-specific reasoning is in AGENTS.md under "Run tests".

`typecheck` is inferred by the `@nx/js/typescript` plugin for the eight packages
that carry a `tsconfig.lib.json` (`core`, `client`, `design`, `adapter-react`,
`adapter-angular`, `live-preview`, `node`, `web`); `adapter-angular` overrides the
inferred target with its own explicit `typecheck` (`tsc --noEmit -p tsconfig.json`)
in `project.json`, since it doesn't build via `tsc --build`/`tsup` like the
others. `adapter-svelte` has no `tsconfig.lib.json` and instead exposes a `check`
script running `svelte-check` — its own real typecheck gate, so its `tsconfig.json`
is the one package config still left with `noEmit: true`.

---

## TypeScript configuration topology

Two roots, one level of packages under each:

```
tsconfig.base.json                dev / editor options
├── tsconfig.json                 trivial root (files: [], include: [])
└── packages/*/tsconfig.json      outDir: out-tsc; adds test types, includes config files

tsconfig.build.json               emit options
└── packages/*/tsconfig.lib.json  outDir: dist / rootDir: src; excludes tests
```

`tsconfig.base.json` and `tsconfig.build.json` currently hold identical
`compilerOptions`; they are separate files so the dev and emit surfaces can
diverge without one leaking into the other. `tsup` and `ngc` read the
`tsconfig.lib.json` variant, which excludes `*.test.*` and test fixtures.
`packages/adapter-angular/tsconfig.lib.json` is the exception to the right-hand
branch: it extends its own package `tsconfig.json` so it can layer
`angularCompilerOptions` (`compilationMode: "partial"`, `strictTemplates`) on
top.

`tsconfig.json`'s `outDir: out-tsc` is a separate, gitignored scratch
directory from `tsconfig.lib.json`'s `outDir: dist` — the two configs
disagree on scope (`tsconfig.json` includes test files, `vitest.config.ts`,
and `tsup.config.ts` itself; `tsconfig.lib.json` excludes all of that), so a
`tsc --build` run against `tsconfig.json` can't emit into `dist/` without
conflicting with the real build output `tsup`/`ngc` produce there.

**Neither root declares `paths`.** Cross-package imports resolve through npm
workspace symlinks, not TypeScript path aliases. Nothing needs updating in a
tsconfig when a package is added or renamed.

---

## Published artifact shape

Every package publishes from its **project root**, not from `dist`. The release
job restores `packages/*/dist` from the CI build cache without rebuilding after
the version bump, so publishing from a generated `dist/package.json` would ship
a stale version. The comment at the top of
`packages/adapter-angular/tsconfig.lib.json` records this as the reason that
package uses `ngc` instead of `ng-packagr`.

`core`, `client`, `runtime`, and `web` publish bundled ESM and CJS entries
(`.js` and `.cjs`) with paired `.d.mts` and `.d.cts` declarations. Their build
targets run `scripts/emit-dual-dts.ts` after tsup to generate the two declaration
surfaces. Node and the framework adapters keep their existing ESM output; the
React adapter remains unbundled so its per-file `'use client'` directives survive
for RSC. Check each package manifest and build target before generalizing these
formats to other packages. The four dual-format package export maps select the
appropriate JavaScript and declaration file for `import` and `require`.

---

## CI and release topology

`.github/workflows/main.yaml` is the only entry point; it runs on pushes to
every branch and calls the other workflows:

```
main.yaml
├── build.yaml    always     npm ci → npm run build → cache packages/*/dist
├── check.yaml    needs build   restore cache → lint → format:check → test
├── release.yaml     if ref == refs/heads/main    restore cache → nx release --yes
└── prerelease.yaml  if ref == refs/heads/dev     restore cache → nx release --specifier prerelease --preid dev
```

The build job hands `packages/*/dist` to every downstream job through one GitHub
Actions cache key, `build-cache-${{ github.run_id }}-${{ github.run_attempt }}`
— scoped to a single run, so each CI run builds once and reuses it. Both release workflows set
`fail-on-cache-miss: true`, so a missing cache fails the release rather than
publishing something unbuilt.

Both release workflows read their credentials from Vault
(`hashicorp/vault-action`, pinned by SHA) and write an `~/.npmrc` that points the
`@contentful` scope at `https://npm.pkg.github.com`; `nx.json` pins the same
registry on the `nx-release-publish` target. Note that the checked-in `.npmrc`
points the scope at `registry.npmjs.org` — that is the _read_ path for installs;
the GitHub Packages registry is written only inside CI.

Versioning itself — independent per-package versions, the 0.x bump cap, and the
`dev` prerelease channel — is the subject of
[docs/ADRs/2026-08-25-independent-package-versioning-with-nx-release.md](./docs/ADRs/2026-08-25-independent-package-versioning-with-nx-release.md).

Commit messages are validated locally by `.husky/commit-msg` against
`commitlint.config.js` (Conventional Commits, `type-enum` restricted to eleven
types, 100-character header limit), and `.husky/pre-commit` runs `lint-staged`.
CI does not re-validate commit messages, but `nx release` derives every version
bump from them, so a message that escapes the hook silently changes what ships.

---

## Where a change lands

| Change                                                                                                  | Touch                                                                          |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Payload shape / resolve semantics                                                                       | `packages/core`                                                                |
| Design-value resolution                                                                                 | `packages/core`                                                                |
| CSS property-name helpers                                                                               | `packages/design`                                                              |
| Delivery, auth, hosts                                                                                   | `packages/client`                                                              |
| Node request facade, request-local fetch/resolve/destination defaults, and event context                | `packages/node`                                                                |
| Web browser locale, context providers, in-memory event profile, and shared-runtime fetch/resolve/events | `packages/web`                                                                 |
| Rendering for one framework                                                                             | that adapter only                                                              |
| Public API surface                                                                                      | every `packages/adapter-*/src/index.ts` — they are kept at parity deliberately |
| New framework adapter                                                                                   | new `packages/adapter-<fw>` leaf + a `project.json` with its own build command |
| Workspace-wide compiler options                                                                         | `tsconfig.base.json` and/or `tsconfig.build.json`                              |
| Build/release orchestration                                                                             | `nx.json`, `.github/workflows/*`                                               |

Step-by-step procedures for the new-adapter and release rows — including the
baseline git tag a new package needs before it can be published — are in
AGENTS.md under "Common tasks".

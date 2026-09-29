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

Nine libraries under `packages/`, in three layers. Every edge below is a
`dependencies` entry in the respective `package.json`; there are no other
cross-package edges.

```
  layer 3       adapter-*       live-preview       node       web
  (public)           │                │               │         │
                     └───────────┬────┴───────────────┴─────────┘
                                 │
  layer 2                     design           client ──▶ @contentful/experience-delivery
  (internal)                    │                │    ├─▶ @contentful/optimization-api-client
                                └───────────┬────┘    ├─▶ es-toolkit
                                            │         └─▶ zod
  layer 1                                  core
  (internal)                       (zero dependencies)
```

Each adapter also depends on `core` **directly**, not only through `design` and
`client` — all three names appear in every `packages/adapter-*/package.json`.

| Nx project        | Directory                  | npm name                               | Depends on                                                            | Public? |
| ----------------- | -------------------------- | -------------------------------------- | --------------------------------------------------------------------- | ------- |
| `core`            | `packages/core`            | `@contentful/experiences-sdk-core`     | — (nothing)                                                           | no      |
| `design`          | `packages/design`          | `@contentful/experiences-design`       | `core`                                                                | no      |
| `client`          | `packages/client`          | `@contentful/experiences-client`       | `core`, delivery client, optimization API client, `es-toolkit`, `zod` | no      |
| `node`            | `packages/node`            | `@contentful/experiences-node`         | `core`, `client`                                                      | yes     |
| `web`             | `packages/web`             | `@contentful/experiences-web`          | `core`, `client`                                                      | yes     |
| `live-preview`    | `packages/live-preview`    | `@contentful/experiences-live-preview` | `core`, `client`                                                      | yes     |
| `adapter-react`   | `packages/adapter-react`   | `@contentful/experiences-react`        | `core`, `design`, `client`                                            | yes     |
| `adapter-svelte`  | `packages/adapter-svelte`  | `@contentful/experiences-svelte`       | `core`, `design`, `client`                                            | yes     |
| `adapter-angular` | `packages/adapter-angular` | `@contentful/experiences-angular`      | `core`, `design`, `client`                                            | yes     |

The graph is acyclic and public packages are leaves — nothing depends on a
public package, and no adapter depends on another. That is what makes a new
framework or platform additive: adding `packages/adapter-vue` adds a leaf and
changes no existing edge. The Web SDK is the existing platform sibling of Node.

**Directory name, Nx project name, and npm package name are three separate
identifiers** (`packages/adapter-react` / `adapter-react` /
`@contentful/experiences-react`), declared in `project.json#name` and
`package.json#name`. Git tags use the Nx project name (`design@0.7.8`), so the
Nx name is what appears in release history.

**Internal dependency versions are exact, not ranges** — `packages/design`
declares `"@contentful/experiences-sdk-core": "0.7.8"`. Those pins are
machine-written on every release, not hand-maintained; see
[the versioning ADR](./docs/ADRs/2026-08-25-independent-package-versioning-with-nx-release.md).
During local development they are irrelevant: npm workspaces symlink
`packages/*` into the root `node_modules`, so every import resolves to the
sibling working copy regardless of the declared version.

### The design → core edge

`packages/design` imports values from `core`, not only types:
`packages/design/src/select-resolved-design.ts` calls `applyTokenResolver` and
`resolveDesignProperties`, which is why `core` sits under `dependencies` in that
manifest. `packages/design/src/viewport.ts` additionally re-exports those same
four helpers verbatim; its header comment records why — the cascade and
token-resolution helpers moved into `core` so the resolve pipeline could
pre-resolve design server-side, and `design` kept re-exporting them to leave its
own public API unchanged. So `core` and `design` expose some identical symbol
names, and the adapters re-export the `design` copy
(`packages/adapter-react/src/index.ts`).

### The delivery-client edge

`packages/client` is the only package that may import
`@contentful/experience-delivery`, and it re-exports the pieces customers need
(`ContentfulViewDeliveryClient`, `NotFoundError`) from
`packages/client/src/index.ts` so the adapters can pass them through without
taking the dependency. The rationale is in AGENTS.md; the structural point is
that this keeps `core` at zero dependencies, which is the invariant every future
adapter inherits.

### Core, Client, Node SDK, and Live Preview responsibilities

`core` is genuinely dependency-free: it contains payload and render-plan types,
`resolveExperience`, diagnostics, and viewport/design-resolution helpers. It
does not own delivery transport, event construction, or connection state.

`client` owns delivery integration, conversion, free fetch functions, the
runtime-neutral `EventBuilder`, and the lower-layer shared
`ContentfulExperiences` runtime. Its `EventBuilder` depends on the optimization
API schemas/logger plus `es-toolkit` and `zod`; those are Client's dependencies,
not Core's. The shared runtime retains stable resolver configuration, delivery
and optional preview clients, and one base event builder. It is stateless with
respect to request and browser state and requires its platform caller to provide
the event channel instead of assuming server or Web.

`node` is the public Node-specific leaf over the shared Client runtime. Its
process-long SDK instance retains only stable configuration and reusable
delivery transports; `forRequest()` creates a request-local facade for fetch,
resolve, and destination operations. This keeps locale and resolve options from
crossing concurrent requests. Node event methods are separate additive work and
are not part of this interim contract. `web` is a sibling public leaf over
Client and Core, not a subclass of Node or a source of Node state. It owns
mutable browser locale and browser context providers, and inherits the shared
runtime's trusted custom-endpoint and direct by-ID CPA preview capabilities. It
has no operational event methods, persistence, or queues in this interim.

For both public leaves, `environmentId` names the Contentful environment used
by by-ID Experience requests; it is distinct from the generated delivery
client's optional `environment` endpoint configuration. The Experiences `host`
option maps to that client's `baseUrl`; callers using a raw client configure
`baseUrl` directly. Explicit `host`/raw-client `baseUrl` wins over generated-client
`environment`, which wins over the delivery or preview default. This configuration
is trusted: its bearer token goes to the selected endpoint. Direct CPA preview
fetches are separate from the Preview Session HTTP/WebSocket transport that
`live-preview` owns.

Framework-adapter barrels do not re-export Node's request facade. `live-preview`
remains the public framework-neutral Preview Session layer. It owns its HTTP
loading, WebSocket subscription, external-store state, and errors.

---

## Layering rules and where they live

| Rule                                            | Encoded in                                                                                          | Enforced by                                                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `core` has no dependencies                      | `packages/core/package.json` (no `dependencies`)                                                    | review                                                                         |
| Only `client` reaches the delivery client       | `packages/client/package.json`                                                                      | review                                                                         |
| Client is runtime-neutral and request-stateless | `packages/client/src/*`                                                                             | review                                                                         |
| Node request state stays request-local          | `packages/node/src/*`                                                                               | review and Node concurrency tests                                              |
| Web browser state stays browser-owned           | `packages/web/src/*`                                                                                | review plus browser and SSR import tests                                       |
| Frameworks are peers, never deps                | `packages/adapter-*/package.json`                                                                   | `publint`, in `adapter-angular`'s Nx `build` target                            |
| Adapters do not surface Node's request facade   | `packages/adapter-*/src/index.ts`                                                                   | review                                                                         |
| Project scope for tags                          | `project.json#tags` (`scope:adapter`, `scope:runtime-neutral`, `scope:sdk`, `layer:*`, `runtime:*`) | declared only — no `@nx/enforce-module-boundaries` rule in `eslint.config.mjs` |

The `tags` in each `project.json` are the seam for mechanical enforcement: the
vocabulary is already assigned consistently, but `eslint.config.mjs` does not
yet include the boundaries rule that would read it. Until it does, the boundary
rules above are review-time conventions, not build failures.

---

## Nx workspace topology

npm workspaces and the Nx project graph cover **different** sets of directories,
which is the single most surprising thing about this workspace.

`package.json#workspaces` is `["packages/*", "examples/*"]` — both are npm
workspaces, so both are symlinked and can consume the SDK packages by name
(`"@contentful/experiences-react": "*"` in `examples/nextjs/package.json`).

But `.nxignore` excludes `examples`, and every plugin entry in `nx.json` is
scoped to `include: ["packages/**/*"]`. So:

- `npm run build` / `npm test` / `npm run lint` / `npm run typecheck` — each
  `nx run-many -t <target>` — touch **only** `packages/*`.
- `nx graph`, `nx affected`, and `nx release` do not see the example apps at
  all.
- The example apps have no `project.json` and are run directly from their
  own directories (`cd examples/nextjs && npm run dev`).

### Targets

`nx.json#targetDefaults` sets `cache: true` on `build`, `typecheck`, `test`, and
`lint`, and adds `dependsOn: ["^build"]` to `build` and `dependsOn:
["^typecheck"]` to `typecheck` — that is what makes `nx run-many -t build`
topological. Each package then declares its own target
commands in `project.json`, because the three adapters do not share a build tool:

| Package           | `build`                               | `test`                                                    |
| ----------------- | ------------------------------------- | --------------------------------------------------------- |
| `core`            | `tsup`                                | `vitest run`                                              |
| `design`          | `tsup`                                | `vitest run`                                              |
| `client`          | `tsup`                                | `vitest run`                                              |
| `node`            | `tsup`                                | `vitest run`                                              |
| `web`             | `tsup`                                | `vitest run` **and** `vitest run -c vitest.ssr.config.ts` |
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

Every package publishes from its **project root**, not from `dist`:
`package.json#files` is `["dist", "README.md", "CHANGELOG.md"]` and the
`exports` map points at `./dist/index.js` / `./dist/index.d.ts`. This is load
bearing — the release job restores `packages/*/dist` from the CI build cache
without rebuilding after the version bump, so publishing from a generated
`dist/package.json` would ship a stale version. The comment at the top of
`packages/adapter-angular/tsconfig.lib.json` records this as the reason that
package uses `ngc` instead of `ng-packagr`.

All nine packages are ESM only — every manifest declares `"type": "module"` and
`sideEffects: false`, and the seven `tsup` packages emit `format: ['esm']` and
nothing else.

The `tsup` packages set `bundle: false`, so `dist` mirrors `src` file for file.
That preserves each file's `'use client'` directive, which the React adapter
depends on under RSC — see the AGENTS.md gotcha before changing it.

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

| Change                                                                   | Touch                                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Payload shape / resolve semantics                                        | `packages/core`                                                                |
| Viewport or design-value math                                            | `packages/design`                                                              |
| Delivery, auth, hosts                                                    | `packages/client`                                                              |
| Node request facade and request-local fetch/resolve/destination defaults | `packages/node`                                                                |
| Web browser locale, context providers, and shared-runtime fetch/resolve  | `packages/web`                                                                 |
| Rendering for one framework                                              | that adapter only                                                              |
| Public API surface                                                       | every `packages/adapter-*/src/index.ts` — they are kept at parity deliberately |
| New framework adapter                                                    | new `packages/adapter-<fw>` leaf + a `project.json` with its own build command |
| Workspace-wide compiler options                                          | `tsconfig.base.json` and/or `tsconfig.build.json`                              |
| Build/release orchestration                                              | `nx.json`, `.github/workflows/*`                                               |

Step-by-step procedures for the new-adapter and release rows — including the
baseline git tag a new package needs before it can be published — are in
AGENTS.md under "Common tasks".

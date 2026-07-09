# AGENTS.md — Operating manual for `contentful/experiences`

A working doc for any agent (or human) hacking on this repo. Covers what's where, why decisions were made the way they were, and what's likely to trip you up. If something below is wrong or stale, fix it in place — this doc is living.

> **Audience:** Anyone touching this codebase. Read [README.md](./README.md) first if you've never seen the project; this doc assumes you've skimmed the customer-facing story.

---

## What this repo is

The renderer SDK suite for Contentful's **Experience Orchestration (ExO)** initiative. Customers register their design-system components against Contentful component-type ids, hand the SDK an Experience payload from XDA, and get back a rendered tree.

Long-term plan (per Charles Hudson's RFC + Tyler Collins' Component Domain Model RFC) is **multi-framework**: React first, with Svelte already shipped as a second adapter to validate the runtime-neutral architecture. Angular / Vue / SwiftUI / Compose follow. Adapter packages are cheap to add by design.

For the broader product context — RFC links, owning teams, related projects — see `~/ChaseOS/projects/active/experiences/` (operator's local notes, not in this repo).

---

## Repo layout

```
experiences/
├── nx.json                   # Nx workspace (release config, target defaults, plugins)
├── tsconfig.base.json        # Shared compiler options (no path aliases — use workspace symlinks)
├── tsconfig.build.json       # tsup uses this; no path aliases, just compiler options
├── tsconfig.json             # Trivial root, extends base
├── package.json              # Workspace root — scripts + shared devDeps
├── eslint.config.mjs         # Flat-config ESLint, applies to all packages
├── catalog-info.yaml         # Backstage metadata for Contentful's internal portal
├── .contentful/              # Repo-local Vault config + GitHub Action permissions
├── .github/workflows/        # CI: build → check → release (release runs only on main)
├── packages/
│   ├── core/                 # @contentful/experiences-core (internal)
│   ├── design/               # @contentful/experiences-design (internal)
│   ├── client/               # @contentful/experiences-client (internal)
│   ├── adapter-react/        # @contentful/experiences-react (customer-facing)
│   └── adapter-svelte/       # @contentful/experiences-svelte (customer-facing)
└── examples/
    ├── nextjs/               # Next.js 15 example app
    └── sveltekit/            # SvelteKit 2 example app (1:1 parity with nextjs)
```

### Package roles

| Folder                    | npm name                           | Audience                                                                                       |
| ------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| `packages/core`           | `@contentful/experiences-core`     | **Internal.** Runtime-neutral types + `resolveExperience`.                                     |
| `packages/design`         | `@contentful/experiences-design`   | **Internal.** Pure viewport math.                                                              |
| `packages/client`         | `@contentful/experiences-client`   | **Internal.** XDN/XPA delivery client factory; re-exported from each adapter.                  |
| `packages/adapter-react`  | `@contentful/experiences-react`    | **Customer-facing.** React renderer + re-exports of everything.                                |
| `packages/adapter-svelte` | `@contentful/experiences-svelte`   | **Customer-facing.** Svelte 5 renderer + re-exports of everything.                             |

**Customers install only the framework adapter for their stack.** The internal packages are workspace dependencies of the adapter — they get installed transitively, but customers never reach into them.

Future framework adapters slot in under the same naming pattern: `packages/adapter-vue`, `packages/adapter-angular`, `packages/adapter-swiftui`, `packages/adapter-compose`.

---

## Architecture in 60 seconds

The customer pipeline is three steps:

```
fetch payload (delivery client) → resolveExperience(payload, config) → <ExperienceRenderer experience={…} />
```

`resolveExperience` is the **single async entry**:

1. Walks the XDA payload's `nodes[]` recursively.
2. Extracts `componentTypeId` from each node's `componentType.sys.urn` (last slash-segment).
3. Splits `contentProperties` and `designProperties` into `node.props.{content,design}`.
4. Captures `slots` as nested `PortableRenderNode[]` arrays (no flat index).
5. Picks up the page-level `payload.sys.template` if present.
6. Runs every customer-declared `resolveData` hook in parallel; results land on `node.props.resolved`.
7. Returns a `PortableRenderPlan`.

The plan is **runtime-neutral** — no React, no DOM, no platform assumptions. Every framework adapter consumes the same plan.

The React adapter then:

1. Computes the active viewport (server: from `initialViewportId`; client: from `useActiveViewport` + `matchMedia`).
2. Builds a `RenderContext` with `{ isPreview, metadata, viewports, activeViewport, activeViewportIndex }`.
3. Walks the plan top-down, pre-rendering slot subtrees as ReactNodes.
4. For each node: looks up the customer's component config by `node.registration.componentTypeId`, resolves design-prop envelopes to scalars at the active viewport, merges everything, calls `render`.
5. If `plan.template` is set and registered, wraps the whole thing with the template's render fn.

---

## Design decisions worth knowing

### Why a single `resolveExperience` entry instead of `buildPlan` + `resolveExperience`?

Earlier the SDK had two functions. The customer page needed three lines of imports + four function calls + two passes of `componentMap`. We collapsed to one. The sync vs async distinction (tree-walking is synchronous; `resolveData` hooks are async) is implementation detail customers don't care about.

### Why is `ctx.design` raw envelopes inside `resolveData`, not viewport-resolved scalars?

Two reasons. (1) Viewport changes on the client should NOT re-trigger async `resolveData` hooks — those might be expensive (database lookups, external API calls). Keeping the resolver pre-viewport means it runs once. (2) If a customer's resolver genuinely needs viewport-aware logic, they can import `getValueForViewport` from the SDK and call it explicitly.

### Why JS-at-render-time for design properties (not CSS variables)?

Pros of CSS-vars output: best perf, real responsive design (works without JS), accessibility win.
Pros of JS-at-render-time (current default): handles non-CSS values (booleans, control-flow), customer components stay vanilla React (no `var(--foo)` boilerplate), works for every framework adapter the same way.

Going JS-first; CSS-vars opt-in is a future feature flag (`defineComponent({ design: 'css' | 'runtime' })`).

### Why `activeViewport` in `RenderContext`, not on the plan?

The list of viewports is on the plan (it's runtime-neutral metadata from the payload). The **active** viewport is per-render and per-framework — React reads it via `matchMedia`, SwiftUI via `@Environment`, Compose via `LocalConfiguration`. Each adapter computes it the way its platform does.

If we baked `activeViewport` into the plan, the plan would either need to be re-built on every viewport change (expensive) or carry framework-specific concepts (breaking the runtime-neutral promise). Neither is right.

### Why no auto-generated node IDs?

We had `generateId()` early on. It's gone. The XDA payload sometimes carries `node.id`; when it does, we pass it through as `node.nodeId` on the IR. When it doesn't, `node.nodeId` is `undefined` and React keys fall back to array index, missing-component warnings omit the id. Generating fake IDs internally added a `crypto.getRandomValues` call per node and gave customers a surface to mistakenly rely on for stable references.

### Why is `Server` separate from `Client` instead of one component?

React's RSC compilation requires a `'use client'` directive at the top of files using hooks. A single component can't both be importable from a server component AND use `useEffect`/`useState`. Two files is mechanically forced; the customer-facing API is two symbols (`ServerExperienceRenderer` for SSR, `ClientExperienceRenderer` aliased as `ExperienceRenderer` for client-side editor mode).

### Why does the customer's `experience-config` use the design-system's own `*Props` types?

Each `defineComponent<Props>(...)` is parameterized over the design-system component's prop type. No separate `ContentfulButtonProps` interface to keep in sync. The design system owns the contract; the integration layer adapts to it. When a Contentful payload field doesn't map 1:1, the customer either (a) renames at the render-fn call site, or (b) uses `resolveData` to reshape, or (c) extends the type at the map level (`type ButtonMapProps = ButtonProps & { testSlot?: ReactNode }`).

### Why is the delivery client bundled in `packages/client` rather than a direct customer dep?

Customers should not need to install or configure `@contentful/experience-delivery` themselves — doing so exposes Fern-generated internals as customer-facing API surface and requires them to wire up XDN vs. XPA selection manually. `packages/client` encapsulates that selection behind `createExperienceClient()`, which each framework adapter re-exports. Customers install only the adapter.

`@contentful/experience-delivery` is a dep of `packages/client` (not peer-dep, not bundled into the dist — it's a normal transitive install). The delivery client version is pinned in `packages/client/package.json`; customers get the version the SDK is tested against.

### Why two separate registries (`components` and `templates`) instead of one?

Components and templates have **structurally different render fns**. Templates always receive `children: ReactNode` (the rendered experience tree). Components don't. Putting them in one map would force a discriminator field on every entry (`{ kind: 'component' | 'template' }`) — more boilerplate for customers and weaker types. Two registries keeps each entry's type narrow.

### Why is `nodeId` optional on the IR but `componentTypeId` required (under `registration`)?

The payload's `id` field is optional from XDA. Without one, the SDK never invents an id (see "no auto-generated node IDs" above). But every node MUST resolve to a component-type — the payload always provides `componentType.sys.urn`. Treating `componentTypeId` as a required field on `registration` lets the renderer dispatch reliably.

The `registration` object exists as a seam for future capabilities/metadata Tyler's RFC describes (state requirements, supported events, lifecycle hints, fallback ids). Today it's just `{ componentTypeId }`; later it grows additively without breaking the IR.

### Why do `Components` and `Templates` use `<any>` internally?

```ts
export type Components = Record<string, ComponentConfig<any>>;
export type Templates = Record<string, TemplateConfig<any>>;
```

Per-entry prop narrowing happens at `defineComponent<Props>(...)` call time, not at registry-lookup time. The renderer dispatches by string key — at that point, the per-component prop type has been erased anyway. Using `any` here is intentional: it's the only way to compose differently-typed entries into one record without forcing customers to wrap entries in a discriminated union.

---

## Conventions

### Commit messages

Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, etc.). Enforced via `commitlint.config.js` + `.husky/commit-msg`. **`feat:` and `fix:` trigger version bumps via `nx release`. `chore:` does NOT trigger a release.**

### Package boundaries

- **`core` may not depend on `react` or any framework-specific package.** Enforced by code review (no module-boundary lint rule yet, but it should land).
- **`design` may not depend on `core` for runtime; it imports types only.** This keeps `design` a pure-utility package usable in isolation.
- **The customer-facing adapter (`adapter-react`) is the ONLY package that re-exports everything**. Internal packages don't re-export from each other.

### File naming

- React components in design-system + adapter packages: `PascalCase.tsx`
- Non-component modules: `kebab-case.ts(x)`
- Tests: `<source>.test.ts(x)` next to the source

### Tests

Vitest. Tests live next to source (`src/foo.test.ts`). The `node` environment is fine for everything (we use `react-dom/server` for renderer tests — no jsdom needed).

### Build

Tsup with `bundle: false` per package. Per-file output preserves `'use client'` directives. Entry: `src/**/*` (with test files excluded).

---

## Gotchas

### `'use client'` preservation

Tsup strips the directive when bundling. We use `bundle: false` per package, which keeps each source file's directive intact in the dist output. **Don't change to `bundle: true` without a replacement plan** — Next.js will refuse to import client-side hook code from a server component.

### Hooks must be in a file with `'use client'`

`use-active-viewport.ts` and `client-renderer.tsx` both start with `'use client'`. If you add a new file using React hooks, **it needs the directive**. Otherwise Next.js's RSC analyzer will complain at build time even if the import is technically correct.

### The active-viewport fallback

If `experience.viewports` is empty, `experience.viewports[0]` is `undefined`. Both renderers guard with a `FALLBACK_VIEWPORT` (`{ id: '_', query: '*', displayName: 'Default', previewSize: '100%' }`) so `experience.activeViewport` is always non-null in customer code. Design-prop resolution against an empty viewport list returns `undefined` for any prop — same as before, no breakage.

### `@types/react` deduplication

Next.js 15 pins `@types/react@19`. Our root devDep is also `@types/react@19`. Mixing versions across the workspace (e.g. one package with `^18`) caused `LayoutProps` constraint failures in the example app. **All packages should align on the same React types version.** Currently 19.

### Template URN extraction shares logic with components

Both ComponentType and Template URNs use the same path shape:

```
crn:contentful:::experience:spaces/$self/environments/$self/{componentTypes|templates}/<id>
```

`extractIdFromUrn(urn)` takes the last slash-segment for both. If Contentful changes the URN format upstream, fix it in **one place** in `core/src/resolve-experience.ts`.

### `examples/nextjs/lib/experience-config.tsx` is `.tsx` not `.ts`

It returns JSX (the render fns). The compiler picks up the `tsx` extension; importing the `tsx` file into `app/[slug]/page.tsx` works because Next resolves both extensions.

### `next-env.d.ts` is gitignored

Next regenerates it on every `next build`. It's in `.gitignore`. If you see lint complaining about it, you've accidentally tracked it — `git rm --cached`.

### Nx cache + tsup builds

`build.yaml` saves `packages/*/dist` to a job-scoped cache; `check.yaml` and `release.yaml` restore it. **The cache key is `build-cache-${run_id}-${run_attempt}`** — meaning each CI run is its own cache. Across runs, Nx's local content-hash cache (`.nx/`) handles incremental work. Don't change the cache path unless you also update both restore steps.

### npm publish vs GitHub Packages

The current release workflow is shaped for **GitHub Packages** (Vault-supplied `GITHUB_TOKEN`, summary linking to `github.com/.../packages`). It is NOT yet wired to publish to npmjs.org. Per-package `publishConfig` does NOT yet declare a registry URL — adding `"registry": "https://npm.pkg.github.com"` is needed before the first release if we go GitHub Packages. Decision pending; flagged in the meeting-prep doc.

### Nx project name vs npm package name vs folder

These three CAN diverge:

- Folder: `packages/adapter-react`
- Nx project name: `adapter-react` (in `project.json`)
- npm package name: `@contentful/experiences-react` (in `package.json`)

Renaming the folder needs all three updated. Cross-reference: `project.json#sourceRoot` (`packages/adapter-react/src`), `project.json#targets.*.options.cwd` (`packages/adapter-react`), and `package.json#repository.directory` (`packages/adapter-react`).

---

## Where things get researched / debated

This repo is the **implementation**. Strategy / RFC / inter-team discussion lives in:

- **Operator's local notes** at `~/ChaseOS/projects/active/experiences/` (Chase's machine):
  - `meeting-prep-tyler-1on1.md` — open architectural questions to discuss with Tyler Collins. Read this before any major decision.
  - `research-charles-rfc.md` — Charles Hudson's Experiences SDK Suite RFC (PROD/6438486129)
  - `research-tyler-domain-model.md` — Tyler's Component Domain Model RFC
  - `research-tyler-repo-model.md` — Tyler's Workspace + Package Composition RFC
  - `research-pr72-and-delivery-client.md` — Thomas Kellermeier's PR #72 + the official `@contentful/experience-delivery` client
  - `research-puck.md` — research on Puck (puckeditor.com) as prior art
  - `research-nx-structure.md` — Nx best practices for this monorepo
  - `decision-nx-package-layout.md` — concrete Nx layout decisions
  - `open-questions.md` — live architectural tensions
  - `experiences.md` — project hub with the broader story

- **Confluence** (Contentful org):
  - PROD/6438486129 — Charles' Experiences SDK Suite RFC
  - Tyler's two component-model docs (linked from his pages)

- **#exo-sdks** Slack channel — weekly engineering syncs run by Manuel Spagnolo

When you're about to make a non-trivial design decision, **check the meeting-prep doc first**. Tyler / Charles / Manuel may have already framed the tradeoff or signaled a direction.

---

## Things known to be deferred / incomplete

### Live preview transport

Editor → SDK communication via `postMessage` (and later WebSocket) for live editor iframe updates. Pattern is documented in PR #72; not yet built. Will land as a `useMessagingClient`-style hook on the client renderer.

### Design tokens

Customer-supplied resolver for `DesignToken` envelopes. Today the SDK passes `DesignToken` envelopes through to customer components untouched. Future `defineTokens([...])` API will let customers declare resolvers (theme + brand + channel + viewport-aware). Tokens RFC'd in Tyler's domain-model doc; deferred to a future package.

### Capabilities on `node.registration`

Tyler's RFC describes `registration: { capabilities: { state, slots, events, lifecycle, rendering } }`. Today we only have `{ componentTypeId }`. The seam exists; the fields are additive when capabilities ship.

### Composite component types

If a Contentful ComponentType is editor-authored (a "composite" of other component types) rather than coded, behavior is unclear. Open question for Tyler. Today's SDK assumes every node references a coded ComponentType the customer has registered.

### Fragments

`@contentful/experience-delivery` exposes a separate `client.fragment.getFragment(...)` endpoint. Today's SDK doesn't see fragments — they're either inlined into the parent Experience by the API, or fetched separately by the customer. Open question for Tyler.

### Slug routing

`client.view.getExperience(spaceId, envId, **experienceId**, ...)` takes an Experience ID, not a slug. Customers want `/blog/my-post` URLs, not `/IBMF5dElL6tgVuNR40fST`. No SDK-side helper today. Open question for Tyler.

### Viewport authoring

There's no editor UI for declaring viewports per-Experience (or globally). Real payloads currently arrive with one wildcard viewport. The SDK's cascade math is correct and works against multi-viewport payloads — but the platform side is missing. Open question for Tyler.

### `resolveData` advanced merge policy

Tyler's RFC describes `defineComponent({ props: { resolve, mergePolicy: { precedence, conflictStrategy }, private } })` — multi-source merge with explicit conflict handling. Today we have a single `resolveData` fn with fixed precedence. Open question for Tyler — is the simpler shape good enough for v1?

---

## Common tasks

### Run tests

```sh
npm test                                         # all packages
npx nx run-many -t test --projects=adapter-react # one package
```

### Build everything from scratch

```sh
find packages -type d -name dist -exec rm -rf {} + 2>/dev/null
npx nx run-many -t build --skip-nx-cache
```

### Run the example app

```sh
cd examples/nextjs
cp .env.example .env.local   # fill in SPACE_ID + CDA_TOKEN
npm run dev                  # http://localhost:3000/<experience-id>
```

### Add a new framework adapter

`packages/adapter-svelte` is the canonical example of "framework that isn't React" — copy from there for non-React frameworks (different build tool, peer dep, etc.); copy from `packages/adapter-react` for "framework like React" (JSX-ish + tsup).

1. `mkdir packages/adapter-vue && cd packages/adapter-vue`
2. Copy structure from `packages/adapter-react` (or `adapter-svelte`) — `package.json`, `project.json`, `tsconfig*.json`, build config (`tsup.config.ts` for React-ish; `svelte.config.js` + `svelte-package` script for Svelte-ish), `vitest.config.ts`
3. Update `package.json#name` → `@contentful/experiences-vue` and `project.json#name` → `adapter-vue`
4. Re-export everything from `@contentful/experiences-core` and `@contentful/experiences-design`
5. Add adapter-specific renderer + `defineComponent` / `defineTemplate` types. The `defineComponent` shape's framework-specific bit is the primitive used to render: React uses `render: (props) => ReactNode`; Svelte uses `component: SvelteComponent`. Vue would use `component: Component`, etc.
6. Add to `transpilePackages` in any example app (React) or to Vite's workspace allowlist (Svelte)

### Add a new internal package (e.g. `tokens`)

1. `mkdir packages/tokens && cd packages/tokens`
2. Mirror `packages/design`'s structure (it's the simplest internal package)
3. Each adapter that wants to expose its API re-exports from it

### Cut a release

```sh
npm run release:dry            # rehearse
npm run release                # actually publish (CI does this)
```

The first release ever needs `--first-release`. After that, `nx release` derives bumps from conventional commits since the last per-project tag.

---

## What to do when something seems wrong

1. **Read this doc and the README.** Re-read; it's likely covered.
2. **Check `~/ChaseOS/projects/active/experiences/meeting-prep-tyler-1on1.md`** for open questions — your "bug" might actually be an unresolved design question.
3. **Run `npx nx graph`** to confirm what depends on what.
4. **Check the example app builds.** It's the integration test for the whole pipeline. If it fails, the bug is in the SDK; if it passes, the bug is somewhere in the customer code.
5. **`git diff main`** — is there a stale change-set you forgot about?

If after all that it's still wrong, **document it in this file** under a "Things known to be broken" section, even if you fix it immediately. Someone will hit the same issue.

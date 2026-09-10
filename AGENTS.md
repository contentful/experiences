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
│   ├── core/                 # @contentful/experiences-sdk-core (internal)
│   ├── design/               # @contentful/experiences-design (internal)
│   ├── client/               # @contentful/experiences-client (internal)
│   ├── live-preview/         # @contentful/experiences-live-preview (customer-facing, optional)
│   ├── adapter-react/        # @contentful/experiences-react (customer-facing)
│   ├── adapter-svelte/       # @contentful/experiences-svelte (customer-facing)
│   └── adapter-angular/      # @contentful/experiences-angular (customer-facing)
├── examples/                # Customer-facing example apps
│   ├── nextjs/               # Next.js 15 example (external developers run this)
│   ├── sveltekit/            # SvelteKit 2 example (1:1 parity with nextjs)
│   └── angular/              # Angular 20 + @angular/ssr example (parity with both)
└── test-apps/               # Internal testing
    ├── nextjs/               # Next.js scratchpad
    └── sveltekit/            # SvelteKit scratchpad
```

**`examples/` vs `test-apps/`.** `examples/` is the stable, external-facing surface — every commit to it should keep the customer-facing "clone + bootstrap + run" flow working. `test-apps/` is where you experiment: try new component patterns, break things, prototype features. Don't reach into `examples/` when you just need a place to poke — copy your changes into `test-apps/` first, iterate there, then port back deliberately.

### Package roles

| Folder                     | npm name                               | Audience                                                                                       |
| -------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `packages/core`            | `@contentful/experiences-sdk-core`     | **Internal.** Runtime-neutral types + `resolveExperience`.                                     |
| `packages/design`          | `@contentful/experiences-design`       | **Internal.** Pure viewport math.                                                              |
| `packages/client`          | `@contentful/experiences-client`       | **Internal.** Experience delivery client + `fetchExperience`. Keeps the delivery dep isolated. |
| `packages/live-preview`    | `@contentful/experiences-live-preview` | **Customer-facing.** Optional, framework-neutral Preview Session source.                       |
| `packages/adapter-react`   | `@contentful/experiences-react`        | **Customer-facing.** React renderer + re-exports of everything.                                |
| `packages/adapter-svelte`  | `@contentful/experiences-svelte`       | **Customer-facing.** Svelte 5 renderer + re-exports of everything.                             |
| `packages/adapter-angular` | `@contentful/experiences-angular`      | **Customer-facing.** Angular renderer (`^20 \|\| ^21 \|\| ^22`) + re-exports of everything.    |

**Customers install the framework adapter for rendering.** The optional `@contentful/experiences-live-preview` package is customer-facing and can be used directly by an application or as an adapter's live-preview data source. The framework adapters declare `core`, `design`, and `client` as dependencies.

Future framework adapters slot in under the same naming pattern: `packages/adapter-vue`, `packages/adapter-swiftui`, `packages/adapter-compose`.

---

## Architecture in 60 seconds

The customer pipeline is three steps:

```
fetchExperience(experienceOptions, clientOptions, resolveOptions) → <ExperienceRenderer experience={…} />
```

`fetchExperience` is the **single async entry** for most customers — it fetches the payload from the Experience Delivery API and calls `resolveExperience` internally. The three positional args group by concern: **which experience**, **how to fetch**, **how to resolve**. Each grouping evolves independently (personalization slots into arg 3; digital-property identifiers widen arg 1) — a shape chosen to avoid one flat options object growing unbounded.

Customers who want to manage the delivery client themselves have two paths: `createClient({ accessToken, host? })` (functional constructor, our option shape), or `new ContentfulViewDeliveryClient({ token, baseUrl? })` (underlying delivery client, its option shape). Either way, pass the resulting client as `{ client }` in `clientOptions`.

`resolveExperience` (called internally by `fetchExperience`) is the **resolve step**:

1. Walks the XDA payload's `nodes[]` recursively.
2. Extracts each node's id from whichever ref it carries — `component.sys.urn` or `experienceTemplate.sys.urn` (last slash-segment) — and records which one in `node.registration.kind`.
3. Splits `contentProperties` and `designProperties` into `node.props.{content,design}`.
4. Captures `slots` as nested `PortableRenderNode[]` arrays (no flat index).
5. Runs every customer-declared `resolveData` hook in parallel; results land on `node.props.resolved`.
6. Returns a `PortableRenderPlan`.

`payload.sys.experienceTemplate` is **never read**. It is `required` on every Experience — a composite one names its template there too — so it carries no coded-vs-composite signal. The node list is the signal: a coded Experience Template shows up as a node whose ref is `experienceTemplate`, a composite one as plain `component` nodes.

The plan is **runtime-neutral** — no React, no DOM, no platform assumptions. Every framework adapter consumes the same plan.

The React adapter then:

1. Computes the active viewport (server: from `initialViewportId`; client: from `useActiveViewport` + `matchMedia`).
2. Builds a `RenderContext` with `{ isPreview, metadata, viewports, activeViewport, activeViewportIndex }`.
3. Walks the plan top-down, pre-rendering slot subtrees as ReactNodes.
4. For each node: looks up the customer's config by `node.registration.id`, against `config.experienceTemplates` when `registration.kind === 'experienceTemplate'` and `config.components` otherwise. Resolves design-prop envelopes to scalars at the active viewport (viewport cascade + `resolveToken`), publishes that record on context for `useDesignValues()` / `getDesignValues()`, and merges it into the final props: `defaults < design < content < resolveData < slots`. Components style themselves from those props — that is the one recommended styling contract. The design hook (and `toCss`) is an escape hatch for nested children that aren't registered components and for design needed outside the render path.
5. Injects one prop per slot the node carries, named after the slot and holding an array (`ReactNode[]` / `Snippet[]`) — `children` is just the conventional name for the default slot, not a special case. Both node kinds get this identically.

An unregistered id degrades rather than blanking the page: a **component** node renders `renderUnknown` (the missing-component box), a **template** node warns and renders its slot children unwrapped.

---

## Design decisions worth knowing

### Why three positional args on `fetchExperience` instead of one options object?

`fetchExperience` carries three concerns at once — fetch, resolve, and per-render context — and has more inbound (personalization params, digital-property identifiers from the channels RFC). A single flat options object would mix all three into one bag of a dozen-plus fields, so the signature is split into three grouped args:

1. `experienceOptions` — **which** experience (`spaceId`, `environmentId`, `experienceId`, `locale`). Digital-property identifiers widen this type when the channels RFC lands.
2. `clientOptions` — **how** to fetch. Discriminated union: `{ accessToken, host? }` OR `{ client }`. Kept intentionally as one arg (not split further) so users can move between inline creds and a pre-made client with only that arg changing.
3. `resolveOptions` — **how** to resolve (`config`, `context`). Personalization params (`audienceIds`, `userTraits`, etc.) go here.

Each grouping evolves without touching the others.

### Why `host: string` instead of `preview: boolean`?

Two reasons. (1) The SDK shouldn't own the URL constants for XDN vs XPA — those are Contentful platform concerns that can add non-prod endpoints (staging, EU-region, per-account) which a boolean can't express. (2) A raw base URL passes cleanly to `ContentfulViewDeliveryClient.Options.baseUrl` — no translation layer. Callers write `host: previewMode ? 'https://preview.xdn.contentful.com' : 'https://xdn.contentful.com'` at the call site; the SDK just passes through.

### Why does every delivery request carry `x-contentful-enable-alpha-feature: new-exo-entity-types`?

The Experience Delivery API gates the entity shapes this SDK reads behind that header — nodes linking `component` (`Contentful:Component`) and `experienceTemplate` (`Contentful:ExperienceTemplate`). A request without the header returns a different shape, which the SDK does not parse. There is no fallback and no normalization layer, so the header is load-bearing rather than optional.

**We no longer send it.** `@contentful/experience-delivery@1.0.0-dev.7` sends it itself, defaulting to `new-exo-entity-types` in both `normalizeClientOptions` and every generated resource method. That covers all three entry points — `fetchExperience`, a `createClient` client, and a raw `ContentfulViewDeliveryClient` a customer constructs — so `packages/client` sets no headers at all. Before dev.7 we sent it from two call sites in `alpha-feature.ts`; that module and its exported constants were removed in the dev.7 cleanup.

One sharp edge in the generated merge order: `mergeHeaders(authHeaders, this._options.headers, <per-request default>, requestOptions.headers)`, later wins. The per-request default lands **after** client-level `headers`, so a `createClient({ headers: { 'x-contentful-enable-alpha-feature': … } })` entry is silently clobbered. Only `requestOptions.headers` (or `requestOptions.xContentfulEnableAlphaFeature`) can override it. Do not document client-level `headers` as an override path for this key.

Why this still matters for types: the delivery client types `GetExperienceResponse` as a union of the shapes the endpoint can return, because the generator can't know which header was sent. dev.7 did not collapse that union, so `fetch-experience.ts` still narrows to `HydratedExperienceView` by hand — the cast is sound because the header is now guaranteed, not because we set it.

### Why `createClient` in addition to the raw `ContentfulViewDeliveryClient` constructor?

`createClient` is a value-added passthrough that maps the SDK's option names (`accessToken`, `host`) onto the underlying client's names (`token`, `baseUrl`). Everything else flows through unchanged. It exists so the "inline creds" and "bring your own client" paths of `fetchExperience` share exactly the same field names — users can move between them mechanically instead of relearning vocabulary.

`fetchExperience`'s own inline-creds branch routes through `createClient` — single source of truth for the name mapping. If we ever add auth flavors beyond bearer-token, this is where they'd land.

### Why an empty-nodes payload is NOT a "not found"

Returning `null` for a payload with `nodes: []` would conflate two states the CMS considers distinct:

- **Experience doesn't exist** (404 from the delivery API) — the delivery client throws `NotFoundError`. Caller should route to their framework's 404 idiom.
- **Experience exists, empty content** (200 with `nodes: []`) — draft, unpublished, empty locale fallback, editor-in-progress. Legitimate CMS state; renders as an empty page.

So an empty-nodes payload flows straight through to `resolveExperience`, which handles it gracefully (no walker iterations, the Experience Template still resolves if present, returns `{ viewports, nodes: [] }`). `fetchExperience` returns `PortableRenderPlan`, never `null`.

For the missing-experience case, `NotFoundError` is re-exported from the adapter (via `packages/client`) so example call sites can wrap `fetchExperience` in try/catch and use the adapter's dependency on `@contentful/experience-delivery`.

### Why a single `resolveExperience` entry instead of `buildPlan` + `resolveExperience`?

Two functions would cost the customer page three lines of imports, four function calls, and two passes of `componentMap`. One entry point avoids that. The sync vs async distinction (tree-walking is synchronous; `resolveData` hooks are async) is implementation detail customers don't care about.

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

### Why is the delivery client (`@contentful/experience-delivery`) isolated in `packages/client`, not a direct dep of the adapters?

Two reasons. (1) `packages/core` must stay zero-dep and runtime-neutral — pulling the delivery client into core would break that invariant for all current and future adapters. (2) The delivery client is large (~3,000 generated files); centralizing it in one internal package (`packages/client`) means adapters that don't need it (e.g. a future server-only adapter) won't pull it in transitively. Customers who want to manage the client themselves can import `ContentfulViewDeliveryClient` directly from the adapter and call `resolveExperience` with their own payload.

### Why two separate registries (`components` and `experienceTemplates`) instead of one?

They are **separate id namespaces in the payload**. A node links either a `Contentful:Component` or a `Contentful:ExperienceTemplate`, and nothing stops the two entity types from sharing an id — so a single flat map could collide, with no way to tell which entry a node meant. The payload already says which namespace applies (`node.component` vs `node.experienceTemplate`, carried into the IR as `registration.kind`), so the renderer picks the registry from the node rather than guessing.

Note that the _render fns_ are not structurally different — a coded Experience Template is an ordinary node whose slots arrive as named props, exactly like a component's. The split is about id resolution, not about templates being special.

### Why is `nodeId` optional on the IR but `registration` required?

The payload's `id` field is optional from XDA. Without one, the SDK never invents an id (see "no auto-generated node IDs" above). But every node MUST resolve to a registered type — the payload always provides one of `component.sys.urn` / `experienceTemplate.sys.urn`. Treating `registration` as required lets the renderer dispatch reliably.

The `registration` object exists as a seam for future capabilities/metadata Tyler's RFC describes (state requirements, supported events, lifecycle hints, fallback ids). Today it's just `{ kind, id }`; later it grows additively without breaking the IR.

### Why do `Components` and `ExperienceTemplates` use `<any>` internally?

```ts
export type Components = Record<string, ComponentConfig<any>>;
export type ExperienceTemplates = Record<string, ExperienceTemplateConfig<any>>;
```

Per-entry prop narrowing happens at `defineComponent<Props>(...)` call time, not at registry-lookup time. The renderer dispatches by string key — at that point, the per-component prop type has been erased anyway. Using `any` here is intentional: it's the only way to compose differently-typed entries into one record without forcing customers to wrap entries in a discriminated union.

---

## Conventions

### Commit messages

Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, etc.). Enforced via `commitlint.config.js` + `.husky/commit-msg`. **`feat:` and `fix:` trigger version bumps via `nx release`. `chore:` does NOT trigger a release.**

**Alpha-phase bump behavior**: `nx.json` sets `version.adjustSemverBumpsForZeroMajorVersion: true`, which applies SemVer V2 semantics for 0.x versions. While packages are on 0.x:

- `feat!` / `BREAKING CHANGE:` → minor bump (e.g., `0.4.0` → `0.5.0`), NOT major
- `feat:` → patch bump (e.g., `0.4.0` → `0.4.1`), NOT minor
- `fix:` → patch bump (unchanged)

Packages stay under `1.0.0` no matter what commit types land. **Remove this setting from `nx.json` when we're ready to ship 1.0.0 GA**

### Package boundaries

- **`core` may not depend on `react`, the delivery client, or any framework-specific package.** Enforced by code review (no module-boundary lint rule yet, but it should land).
- **`design` may not depend on `core` for runtime; it imports types only.** This keeps `design` a pure-utility package usable in isolation.
- **`client` is the only package that may depend on `@contentful/experience-delivery`.** All delivery-client usage must go through `packages/client` — never import it directly from an adapter or from `core`.
- **The customer-facing adapter (`adapter-react`) owns the SDK-wide re-exports.** The `live-preview` package has its own customer-facing entry point. Internal packages keep their exports in their own entry points.

**Consequence for `core`'s payload types.** Because `core` stays zero-dep, its payload-facing types (`ExperienceNode`, `ComponentNode`, `ExperienceTemplateNode`, `ComponentRef`, `ExperienceTemplateRef`, `ExperienceSys`, `ExperiencePayload`) are **hand-mirrored** from `@contentful/experience-delivery` rather than imported from it. Each carries a doc comment naming its upstream counterpart (`RenamedComponentTreeNode`, `ComponentLink`, `RenamedDeliveryExperienceSys`, …). They're deliberately structural supersets — a few upstream-required fields are optional here so `resolveExperience` also accepts hand-authored payloads — which is why `fetch-experience.ts` can assert a delivery response straight to `ExperiencePayload` with no normalization step.

**When the delivery SDK regenerates, re-check that mirror.** `packages/core/src/types.ts` is the only place it lives; `client:typecheck` is what catches a drift, because that assertion stops compiling if the shapes diverge.

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

### Experience Template URN extraction shares logic with components

Both Component and Experience Template URNs use the same path shape:

```
crn:contentful:::experience:spaces/$self/environments/$self/{components|experienceTemplates}/<id>
```

`extractIdFromUrn(urn)` takes the last slash-segment for both. If Contentful changes the URN format upstream, fix it in **one place** in `core/src/resolve-experience.ts`.

### `examples/nextjs/lib/experience-config.tsx` is `.tsx` not `.ts`

It returns JSX (the render fns). The compiler picks up the `tsx` extension; importing the `tsx` file into `app/[slug]/page.tsx` works because Next resolves both extensions.

### `next-env.d.ts` is gitignored

Next regenerates it on every `next build`. It's in `.gitignore`. If you see lint complaining about it, you've accidentally tracked it — `git rm --cached`.

### Nx cache + tsup builds

`build.yaml` saves `packages/*/dist` to a job-scoped cache; `check.yaml` and `release.yaml` restore it. **The cache key is `build-cache-${run_id}-${run_attempt}`** — meaning each CI run is its own cache. Across runs, Nx's local content-hash cache (`.nx/`) handles incremental work. Don't change the cache path unless you also update both restore steps.

### Publishing

Packages publish to **GitHub Packages**, and org infrastructure mirrors to npmjs.org via trusted publishing. This matches every other Contentful monorepo (`mcp-server`, `rich-text`, `field-editors`, `live-preview`, `apps`, etc.). Auth is Vault-provisioned `GITHUB_PACKAGES_WRITE_TOKEN`. The `nx-release-publish` target in `nx.json` pins the registry to `https://npm.pkg.github.com`.

**One-time bootstrap per package**: on first release of a new package name to GitHub Packages, a manual `npm publish` to npmjs is required to establish the package there so the mirror can pick it up on subsequent releases. See `contentful/contentful-experience-delivery.js/RELEASING.md` for the runbook.

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
  - `research-charles-rfc.md` — Charles Hudson's Experiences SDK Suite RFC
  - `research-tyler-domain-model.md` — Tyler's Component Domain Model RFC
  - `research-tyler-repo-model.md` — Tyler's Workspace + Package Composition RFC
  - `research-pr72-and-delivery-client.md` — Thomas Kellermeier's PR #72 + the official `@contentful/experience-delivery` client
  - `research-puck.md` — research on Puck (puckeditor.com) as prior art
  - `research-nx-structure.md` — Nx best practices for this monorepo
  - `decision-nx-package-layout.md` — concrete Nx layout decisions
  - `open-questions.md` — live architectural tensions
  - `experiences.md` — project hub with the broader story

- **Confluence** (Contentful org):
  - Charles' Experiences SDK Suite RFC
  - Tyler's two component-model docs (linked from his pages)

- **#exo-sdks** Slack channel — weekly engineering syncs run by Manuel Spagnolo

When you're about to make a non-trivial design decision, **check the meeting-prep doc first**. Tyler / Charles / Manuel may have already framed the tradeoff or signaled a direction.

---

## Things known to be deferred / incomplete

### Design tokens

Customer-supplied resolver for `DesignToken` envelopes. Today the SDK passes `DesignToken` envelopes through to customer components untouched. Future `defineTokens([...])` API will let customers declare resolvers (theme + brand + channel + viewport-aware). Tokens RFC'd in Tyler's domain-model doc; deferred to a future package.

### Capabilities on `node.registration`

Tyler's RFC describes `registration: { capabilities: { state, slots, events, lifecycle, rendering } }`. Today we only have `{ componentId }`. The seam exists; the fields are additive when capabilities ship.

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

### `useExperience()` hook split

`useExperience()` (React) / `getExperience()` (Svelte) returns the whole `RenderContext` — `debug`, `metadata`, `viewports`, `activeViewport`, `activeViewportIndex` — as one object. An open question is whether that single hook should split into narrower reads (e.g. `useViewport()`, `useMetadata()`, `useDebug()`) so a component that only needs the active viewport doesn't re-render on unrelated context changes.

Investigation (consumer sweep): the only **SDK-internal** consumer of the context is `MissingComponent`, which reads `debug`. `useActiveViewport` is a separate hook already; it feeds the renderer, not components. Every other read is **customer-facing** through the public `useExperience()` / `getExperience()`. So a split is a pure public-API change with no internal blocker — but also no internal forcing function. Reactivity today: React republishes the whole context object on viewport change (so any `useExperience()` consumer re-renders); Svelte's `getExperience()` returns a `$state` mirror whose fields update in place, so fine-grained reactivity already works there via `$derived`. The asymmetry means a split would mostly benefit React.

Deferred: the single hook stands for now. Revisit if React re-render churn shows up in practice, or alongside the live-preview transport work (which adds another context-shaped subscription). When it lands, split React with context selectors (or separate providers) and mirror the Svelte side with narrow `get*()` helpers for API parity.

### Svelte: no SSR recovery for `component-render-error`

`<svelte:boundary onerror failed>` doesn't run its catching machinery under `svelte/server` — a throw during SvelteKit's server render propagates and fails the entire page; the boundary only catches client-side. React and Angular don't share this gap (React's per-node `<Suspense>` boundary degrades gracefully under streaming SSR too; Angular has no separate server renderer at all). See the README's [Error handling & troubleshooting](./README.md#error-handling--troubleshooting) section for the full per-framework table.

This is upstream Svelte behavior, not something fixable at the adapter level — `svelte/server` exposes no per-node recovery primitive below its single top-level `render()` call. The README's mitigation is a `handleError` hook, which turns the crash into a controlled response without giving per-node isolation. Revisit if Svelte ships SSR-aware error boundaries.

### Angular: `component-render-error` isolation covers creation-time and adapter-driven resolution, not customer-internal later throws

`NodeRenderEngine.createView` wraps `viewContainerRef.createComponent(...)` in try/catch, catching a throw from a component's constructor, template evaluation, or `ngOnInit`. `collect()` separately wraps its own `unit.resolution()` read, so a throw from `resolveNode`/`resolveDesign` recomputing on a later sync (a `resolveToken` that starts failing, say) also swaps that node to the error fallback, and recovers automatically once resolution succeeds again (tracked via `unit.resolutionFailed`, mirroring `attemptedComponentType`'s "don't retry the same failure every sync" pattern).

Not caught: a throw inside the _customer_ component's own internals on a later change-detection pass (its own template expression, computed, or lifecycle hook) — that never touches adapter code, so nothing here catches it. A per-node `ErrorHandler` provider looks like the natural fix, since providers already flow per-node in this adapter, but doesn't work: `ApplicationRef.tick()` resolves `ErrorHandler` once, from the root injector, at construction, and never re-resolves it from whichever component's injector actually threw. This is a documented residual gap, not a partial fix. Revisit if Angular's error-handling internals change, or if there's a way to hook `ApplicationRef`'s zone-level error handling instead of DI.

---

## Common tasks

### Run tests

```sh
npm test                                         # all packages
npx nx run-many -t test --projects=adapter-react # one package
```

`adapter-svelte` runs **two** Vitest projects, and its `test` target runs both:

| Config                 | Env   | Files           | Svelte output |
| ---------------------- | ----- | --------------- | ------------- |
| `vitest.config.ts`     | jsdom | `*.test.ts`     | client        |
| `vitest.ssr.config.ts` | node  | `*.ssr.test.ts` | server        |

The split exists because the two Svelte builds are not interchangeable — most
notably, a compiled snippet receives its arguments as getters on the client but
by value on the server, and `NodesRenderer` constructs one snippet call by hand.
Anything touching snippets or slot rendering needs coverage in **both**.

`adapter-angular` uses the same two-config split — `vitest.config.ts` (jsdom) and
`vitest.ssr.config.ts` (node, `*.ssr.test.ts`, currently
`nodes-renderer.ssr.test.ts`) — for the same reason: the SSR path bootstraps
through `@angular/platform-server`, which behaves differently enough from the
jsdom path to need its own environment. Note that `test.projects` in a single
config would be the tidier form, but that needs Vitest 3.2+ and the workspace is
pinned to 1.6.

### Build everything from scratch

```sh
find packages -type d -name dist -exec rm -rf {} + 2>/dev/null
npx nx run-many -t build --skip-nx-cache
```

### Run the example app

```sh
# 1. Seed the demo Experience into your target space (one-time).
cd examples/scripts
cp .env.example .env         # fill in SPACE_ID, ENVIRONMENT_ID, CMA_TOKEN
npm run bootstrap            # prints experienceId (default: `landing`)

# 2. Run the app.
cd ../nextjs
cp .env.example .env.local   # fill in SPACE_ID, ENVIRONMENT_ID, CDA_TOKEN
npm run dev                  # http://localhost:3000/landing
```

The bootstrap script (`examples/scripts/bootstrap-example.ts`) provisions everything the demo Experience references — ContentType, entries, assets, design tokens, ComponentTypes, Template, DataAssemblies, Experience — via the experiences management API (currently `contentful-management@12.6.0-dev.4`). Idempotent per resource; safe to re-run against a half-seeded env. See `examples/scripts/README.md` for details.

### Add a new framework adapter

`packages/adapter-svelte` and `packages/adapter-angular` are the canonical examples of "framework that isn't React" — copy from either for non-React frameworks (different build tool, peer dep, etc.); copy from `packages/adapter-react` for "framework like React" (JSX-ish + tsup). `adapter-angular` is the closest template for a framework whose compiler owns the build: its `build` target is `ngc -p tsconfig.lib.json && publint`, with no bundler config at all.

1. `mkdir packages/adapter-vue && cd packages/adapter-vue`
2. Copy structure from `packages/adapter-react` (or `adapter-svelte` / `adapter-angular`) — `package.json`, `project.json`, `tsconfig*.json`, build config (`tsup.config.ts` for React-ish; `svelte.config.js` + `svelte-package` script for Svelte-ish; `tsconfig.lib.json` + `ngc` for Angular-ish), `vitest.config.ts`
3. Update `package.json#name` → `@contentful/experiences-vue` and `project.json#name` → `adapter-vue`
4. Set `package.json#version` to `"0.0.0"` — nx release needs a valid semver to bootstrap from (see "Bootstrapping a new package for release" below).
5. Re-export everything from `@contentful/experiences-sdk-core` and `@contentful/experiences-design`
6. Add adapter-specific renderer + `defineComponent` / `defineExperienceTemplate` types. The `defineComponent` shape's framework-specific bit is the primitive used to render: React uses `render: (props) => ReactNode`; Svelte uses `component: SvelteComponent`; Angular uses `component: Type<unknown>`. Vue would use `component: Component`, etc.
7. Teach the example app's bundler to transpile the workspace packages — `transpilePackages` (React/Next), Vite's `ssr.noExternal` allowlist (Svelte). Angular needs nothing here: `@angular/build:application` inlines workspace dependencies on both the browser and server builds.

### Add a new internal package (e.g. `tokens`)

1. `mkdir packages/tokens && cd packages/tokens`
2. Mirror `packages/design`'s structure (it's the simplest internal package)
3. Set `package.json#version` to `"0.0.0"` — nx release needs a valid semver to bootstrap from (see "Bootstrapping a new package for release" below).
4. Each adapter that wants to expose its API re-exports from it

### Bootstrapping a new package for release

Nx release computes each package's next version by finding the most recent git tag matching `{projectName}@{version}` and analyzing conventional commits since that tag. A brand-new package has no such tag, and `nx release` on `main` iterates every package in `packages/*` atomically — so a single missing tag will fail the release for the entire workspace, not just the new package.

Order matters:

1. On the new-package branch, set `package.json#version` to `"0.0.0"`. (Don't create `CHANGELOG.md` — nx generates it on first release.)
2. **Before merging**, seed the tag against `main`. Tag the commit **just before** the new-package introduction commit — this way nx sees the introduction as an unreleased `feat:`, so the first release actually publishes to npm. If you tag AT the introduction commit, the package sits at `0.0.0` until the next feat/fix touches it, which breaks any other package that lists it as a runtime dep.
   ```sh
   git checkout main
   git pull
   git tag -a <dir>@0.0.0 <sha> -m "Baseline tag so nx-release can derive bumps for <dir>"
   git push origin <dir>@0.0.0
   ```
3. Merge the new-package PR to `main`.
4. The next push to `main` triggers nx release. It sees the `<dir>@0.0.0` tag, scans commits from there forward, finds the `feat:` that introduced the package, and computes the first real release. Nx also creates `packages/<dir>/CHANGELOG.md` on this first run.

**If you merge before seeding the tag**, the next release run on `main` will fail for the whole workspace. Recovery:

```sh
git checkout main && git pull
git tag -a <dir>@0.0.0 <parent-of-introduction-sha> -m "Baseline tag so nx-release can derive bumps for <dir>"
git push origin <dir>@0.0.0
# Then push any new commit to main (or re-run the failed workflow) to trigger CI.
```

Same-shape command as step 2 — just done after the fact.

### Cut a release

Releases are fully automated by CI on push to `main` (stable) or `dev` (prerelease). Every `feat:` / `fix:` commit that touched a package's directory triggers a version bump for that package on the next merge.

- **Stable** — push to `main` → `release.yaml` runs `npx nx release --yes`. Publishes to npm's `latest` dist-tag; creates git tags and GitHub Releases; commits `chore(release): publish {version} [skip ci]` back to `main`.
- **Prerelease** — push to `dev` → `prerelease.yaml` runs `npx nx release --specifier prerelease --preid dev --yes`. Publishes to npm's `dev` dist-tag as `X.Y.Z-dev.N`; creates git tags and GitHub Releases marked "pre-release"; commits back to `dev`.

Consumers install with:

```sh
npm install @contentful/experiences-react           # latest stable
npm install @contentful/experiences-react@dev       # newest dev prerelease
```

**`dev` is not meant to be merged into `main`.** The two branches accumulate independent CHANGELOG histories so `main`'s file stays clean of prerelease entries. Features that should ship on both branches should be committed to each independently. Matches the pattern in `contentful/contentful-mcp-server`.

**`releaseTagPatternStrictPreid: true`** in `nx.json` ensures stable `nx release` on `main` skips over any preid-suffixed tag (e.g., `adapter-react@0.5.0-dev.3`) when computing the next version — dev tags cannot poison main's stable release computation.

Local dry-run to preview:

```sh
npx nx release --dry-run                                            # what a stable release would do
npx nx release --specifier prerelease --preid dev --dry-run         # what a dev prerelease would do
```

The first-ever release for a new package needs `--first-release` on its first run so nx doesn't look for a prior tag.

---

## What to do when something seems wrong

1. **Read this doc and the README.** Re-read; it's likely covered.
2. **Check `~/ChaseOS/projects/active/experiences/meeting-prep-tyler-1on1.md`** for open questions — your "bug" might actually be an unresolved design question.
3. **Run `npx nx graph`** to confirm what depends on what.
4. **Check the example app builds.** It's the integration test for the whole pipeline. If it fails, the bug is in the SDK; if it passes, the bug is somewhere in the customer code.
5. **`git diff main`** — is there a stale change-set you forgot about?

If after all that it's still wrong, **document it in this file** under a "Things known to be broken" section, even if you fix it immediately. Someone will hit the same issue.

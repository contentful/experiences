# Merge the client and server renderers into one

- **Date:** 2026-09-16
- **Status:** Accepted
- **Ticket:** [AIS-562](https://contentful.atlassian.net/browse/AIS-562) (spike), under [AIS-365](https://contentful.atlassian.net/browse/AIS-365) ExO SDK — Beta Readiness

## Context

Every adapter shipped two renderer components with near-identical props:

| Adapter | Client                            | Server                            |
| ------- | --------------------------------- | --------------------------------- |
| React   | `ClientExperienceRenderer`        | `ServerExperienceRenderer`        |
| Svelte  | `ClientExperienceRenderer.svelte` | `ServerExperienceRenderer.svelte` |
| Angular | `<cf-experience>`                 | `<cf-server-experience>`          |

Alpha feedback asked for one component, with client-only hooks importable
separately. The pair differed in exactly two ways:

1. **Viewport handling.** The client renderer called `useActiveViewport` /
   `injectActiveViewport`, which subscribe to `window.matchMedia` and re-resolve
   design values when the active viewport changes. The server renderer resolved
   the viewport once from `initialViewportId` and never reconsidered.
2. **Diagnostics collection.** The client renderer held render diagnostics in
   framework state so a component throwing after hydration would re-render
   `<DebugExperience>`. The server renderer pushed into a plain array, which is
   sufficient because SSR is a synchronous single pass.

The split was not stylistic. In React it was mechanically forced: `'use client'`
is required in any file using hooks, and a component in such a file cannot be
imported by a React Server Component. `useActiveViewport` needs `useState` and
`useEffect`, so the renderer calling it could never be an RSC — and
`AGENTS.md` recorded exactly that as the reason two files existed.

What changed is upstream: viewports are being removed from the ExO platform
([SPA-5269](https://contentful.atlassian.net/browse/SPA-5269)). Only one viewport
(`{ id: "" }`) has ever been used in production, and design properties flatten
from `{ prop: { "": value } }` to `{ prop: value }`. With no viewports there is
nothing reactive to subscribe to, which removes the constraint that forced the
split.

## Decision

**One renderer per adapter, named `ExperienceRenderer`** (Angular:
`ExperienceRendererComponent`, selector `<cf-experience>`). The `Client*` and
`Server*` components are removed rather than deprecated — the packages are 0.x
and pre-beta, so there is no compatibility window to honor.

**Viewport support is removed from the SDK in the same change**, not staged
behind the platform rollout. Removing the renderer split without removing
viewports would mean keeping `matchMedia` tracking with no component able to own
it. The two are one change: `ViewportDef`, `ValuesByViewport`, the cascade,
`getViewportIndex`, `getValueForViewport`, `toCssMediaQuery`,
`createMediaQueryMatchers`, `useActiveViewport` / `injectActiveViewport`,
`initialViewportId`, `fallbackViewportId`, and the `viewports` /
`fallbackViewportIndex` / `activeViewport*` fields on the plan and render context
all go. `getValueForViewport` becomes `getDesignValue(prop)`.

**Client-only hooks stay where they are, behind `'use client'`.** They did not
need to move to a subpath export. A customer component that calls
`useDesignValues()` or `useExperience()` becomes a Client Component and the
renderer above it stays a Server Component — the normal RSC composition. No
`package.json` `exports` split was needed, which is why none was added.

**React keeps a debug-only client boundary.** `ComponentErrorBoundary.componentDidCatch`
fires only client-side, after hydration, because React runs no class-error-boundary
machinery during SSR. A component that throws therefore reports well after the
synchronous render pass, and a plain array could never re-render the panel with
it. Debug mode mounts `DebugCollector`, a small `'use client'` component that
owns that reactive list and receives the already-rendered tree as `children` —
elements cross the RSC boundary, `config` does not. With `debug` off, which is
every production render, nothing client-side is mounted.

Svelte and Angular need no such split: `$state` and signals work identically
under SSR and in the browser, so their merged renderers hold both collectors
directly.

## Consequences

**The public API is smaller and the SSR/CSR choice disappears.** Customers no
longer pick a renderer based on where it runs, and there is no way to pick wrong
— which was the actual failure mode the two-component API invited.

**This is a breaking change requiring a major version.** Consumers importing
`ClientExperienceRenderer`, `ServerExperienceRenderer`, `<cf-server-experience>`,
`useActiveViewport`, `injectActiveViewport`, or passing `initialViewportId` must
update. Migration is mechanical: rename to `ExperienceRenderer` and drop the
viewport props.

**The SDK now ships ahead of the platform rollout it depends on.** SPA-5269 is
phased and flag-gated (`release-exo-remove-viewports`, default off), and its
Phase 1 asks consumers only to _tolerate_ an absent `viewports` field. This
change goes further and removes the concept outright, so the SDK stops reading
`payload.viewports` before the API stops sending it. That is safe in this
direction — an ignored field cannot break a render — but it means the SDK is no
longer able to consume per-viewport design values should the rollout be paused or
reversed. Releasing it should be sequenced against the epic's COMM step and its
changelog entry rather than published silently.

**One debug-panel behavior is preserved by a second collector, not for free.**
See the React note above: the reactive path exists solely for
`component-render-error`. Dropping it would have been simpler and would have
silently stopped listing post-hydration throws in the debug panel, so it was
kept and covered by tests.

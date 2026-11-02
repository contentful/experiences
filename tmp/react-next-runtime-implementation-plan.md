# React and Next.js runtime integration implementation plan

Implement runtime-backed React and Next.js integration by evolving the existing React package and adding a dedicated Next.js package. Keep rendering shared in React and keep delivery, identity, consent, queues, handoff admission, and interaction measurement in the existing runtimes.

The accepted implementation scope covers runtime-owned live preview and React/Next.js integration, including the breaking API migration. Phases 1–5 remain complete and accepted. **Phase 6 is complete and explicitly accepted on 2026-11-02.** Its superseded historical acceptance at `5db2ea217617f41fd84a7207780c2877b32c4cf7` and earlier checks/review remain historical. Phase 7 is implemented and awaiting user acceptance; its Phase 6 completion/acceptance gate is satisfied. The [cleanup plan](./react-next-runtime-xda-cleanup-plan.md) defines the current owner corrections and support; historical live Web observations and the temporary default-context limits remain recorded below.

## Scope and non goals

Account for non-Next.js React meta-frameworks when designing the React integration. Astro is an architectural example: a host may have independent React roots, application-owned loading, and a different hydration or navigation lifecycle. Keep React free of Next-specific assumptions and expose supplied-plan rendering, injected runtimes, shared ownership, and explicit lifecycle inputs that such hosts can compose.

Actual Astro support and coverage are non-goals. Do not add Astro-specific entrypoints, adapters, composition components, dependencies, examples, fixtures, hydration-directive support, or integration tests. Validate generic React contracts in their owning package tests and the maintained React example/reference, including independent roots; these checks do not establish support for a particular meta-framework.

Deploying upstream XDA changes or adding an XDA commit override is outside this workstream; event-bearing XDA already forces noncommitting preflight. Phase 6 corrects ordinary SSR/CSR fetch and retains only the minimal actual hybrid transfer support for optional explicit browser replay. SSR/CSR XDA intent remains uncommitted pending upstream force-commit support. Phase 6 must complete current optional React consumption and its basic consent/lifecycle behavior; Phase 7 owns managed React loading/navigation and the React reference. Content display requires no replay/commit/identity success barrier or new profile-provenance registry.

Live-preview integration is in scope for Runtime, Node, Web, React/Next.js, and their reference implementations. The optional `@contentful/experiences-live-preview` package is frozen: do not change its source, public APIs/exports, manifest/dependencies, build configuration, tests, or documentation. Its existing builds and tests may run unchanged. Add the integration wrapper in the SDK, using only the package's public exports; do not copy/fork its internals, use private imports, monkey-patch transport, or recreate its protocol to bypass the freeze. The package retains Preview Session transport/protocol behavior; runtimes coordinate initialization, policy, effective resolution options, observable content, and lifetime within that public API. Use XDA subscriptions and existing observable conventions. Optimization's separate preview-package packaging is the reference; do not port its preview bridge or client-side variant overrides. Consumers opt in once and continue using ordinary Experience requests and rendering components.

Framework integration remains limited to React and Next.js. Phase 6 has a narrow exception for removing obsolete XDA event shapers/callers and necessary contract migration in `examples/angular/src/app/lib/personalization.ts`, `examples/sveltekit/src/lib/server/personalization.ts` and `examples/nextjs/lib/personalization.ts`; no unrelated framework/example changes are authorized. Preserve independently useful public contracts of shared packages used by those adapters. Phase 6 may remove or reshape workaround-only helpers/exports and must update all dependent consumers, types, tests and documentation; add no compatibility shim solely to retain an obsolete workaround. Changes to the existing Node, Web, and Node + Web references remain limited to live-preview integration and its configuration, packaging, documentation, and lifecycle requirements, plus the targeted XDA cleanup assigned by phase 6's separate plan. Existing example issues unrelated to the React/Next.js runtime migration remain separate follow-up work.

Unit tests must make no network calls. Use ordinary test doubles such as mock functions, spies, stubbed SDK methods, and simple controlled return values or promises. Reuse existing package test support and keep new doubles local to the tests that need them. Package-level unit/SSR/contract tests use these simple doubles where needed and remain free of network calls.

MSW, mock servers, service-simulation infrastructure/fixtures, E2E tests, and E2E tooling are outside this workstream: do not add, modify, or use them for this work. Do not modify `lib/mocks` or add test-only production hooks. Existing package tests and their support may run unchanged within these boundaries and the Live Preview package freeze. Import/type/export checks, example/reference builds, and direct live browser inspection remain available; direct inspection of maintained applications may use their configured services.

The only runnable consumers are the maintained example apps and reference implementations specified in this plan. Add live preview to `implementations/node-sdk`, `implementations/web-sdk`, and `implementations/node-sdk+web-sdk` in phase 2. Build `implementations/react-sdk` and `implementations/nextjs-sdk` alongside their SDK capabilities and integrate the same runtime-backed preview behavior. The Next reference exercises App Router and Pages Router within one app. Migrate `examples/nextjs` and add the planned React example in phase 13, using the APIs exercised by the references. Add no standalone validation apps, temporary consumer projects, feasibility apps, or app-per-scenario matrices, including under `examples/` or `implementations/`. Disposable temporary verification code is permitted; it must not change maintained reference use cases/flows or become a maintained test app. Package checks use the existing test, typecheck, and packaging infrastructure. Validation is proportional to changed logic and material risks; an exhaustive combination of modes, routers, versions, and failure states is not a deliverable.

## Current implementation and boundaries

Optimization parity now uses committed source at `f76f1ff04df1b466c98fc6ce5db6b569f9212438` from open [PR #549, `restore/runtime-preview-after-release`](https://github.com/contentful/optimization/pull/549), not main or the adjacent working tree. Earlier phases used `59add9d6ebff503b9033a59a2eee0149d4b4e925`; that pin is historical evidence only and is superseded for this correction. Read source with `git -C /Users/charles.hudson/Projects/contentful/optimization show f76f1ff04df1b466c98fc6ce5db6b569f9212438:<path>`.

**Current correction contract (verified; Phase 6 complete and accepted):** Ordinary SSR uses
Node fetch; CSR and browser-local navigation/actions use ordinary Web fetch.
Existing type-tagged builder arguments or raw built events remain supported, with
SDK-owned construction once. Only actual server-to-browser transfers retain Node
`fetchExperienceForHandoff(options, resolveOptions, { routeKey })`, returning a
full handoff plus optional plan/error. Optional Web/React consumption is mode agnostic
and explicitly consumer supplied; normal fetch needs no handoff. Actual Node
producer event hooks run sequentially like Optimization preparation; ordinary
Node/Web fetch chains remain concurrent with ordered results.

XDA always invokes XPAPI preflight without committing. SSR/CSR XDA events remain
uncommitted as a tolerated service bug awaiting upstream force-commit support.
There is no current force flag or SDK workaround. Remove Node aggregate commitment,
the Web handoff producer and all handoff-as-content re-evaluation union branches/
helpers. Direct event APIs remain callable, not prerequisites or compensation.

For ordinary SSR/CSR, tolerate XDA noncommit while the flow has no observed
blocking errors. Do not synthesize extra XPAPI calls, require commit confirmation,
or classify a provisional profile ID alone as failed initialization. Future
upstream support is expected to allow XDA requests configured with `preflight: false`
to commit their carried events directly; this is not a current SDK option or
Phase 7 deliverable. Insights acceptance of provisional IDs is an expectation,
not a verified guarantee; report any observed blocking integration errors. Actual
hybrid transfers retain the existing server-supplied browser replay path.

Same-ID content Retry and later reference comparison IDs use ordinary event-free
fetch without builders, event hooks, publication, admission or replay. Incoming
accepted replay delivery retry remains queue-owned. Official support is one
Experience per page, unenforced; reference loops provide no multi-Experience or
cross-fetch guarantee. Page Two CUSTOM TRACK is nonpage intent; navigation still
carries a page. See [Runtime XDA contract](../packages/runtime/README.md#xda-preflight-and-profile-finalization) for canonical details and retained replay rules.

Browser handoff identity is captured before hydration in this order: current live profile, configured anonymous provider, then `handoff.profileId`. Ordinary request identity remains provider-first. The XDA-returned ID is paired with the finalized batch as continuation fallback; live browser continuity may supersede that ID. Exact event-message preservation does not guarantee commit evaluation/selection or same-profile finalization under a different live identity. Hydration, queue admission and local identity adoption do not establish commit success.

**Retained aggregate ownership (verified; Phase 6 complete and accepted):** See the [concrete source/departure and planned owner-evidence map](./react-next-runtime-xda-cleanup-plan.md#remedy-departures-and-planned-owner-evidence).

Use Web's accepted-route tracker for replay or gated fallback only for page-bearing refused replay or explicit page intent; add no `initialPageEvent` emit/skip API, hook-owned first-route skip or post-terminal mark-accepted rule. Consent refusal is terminal for supplied replay; after grant a still-current page-bearing handoff skips the blocked batch and uses the existing `trackCurrentPage` fallback if eligible. This is the normal implicit page path, with no dedicated API, scheduler, controller or state class; blocked nonpage replay remains dropped. Ordinary offline capacity refusal precedes publication and never evicts accepted work. Capacity refusal remains retry-eligible while the complete operation returns `{ accepted: false }`. If an eligible page fallback is accepted, the current initialization is complete and the original refused replay batch is not resubmitted; accepted replay is never replaced by fallback on HTTP failure. Keep one stable root across replay/nonreplay navigation. Matching replay supersedes a pending initial callback, and late callback completion cannot emit a competing page. Preserve preview, reset, consent-withdrawal, owner replacement and teardown safeguards.

Remove the standalone XPAPI `prepareRequestHandoff` mechanism, separate `createRequestHandoffFromData` producers and public `hydrateHandoffState` workflow. Node `fetchExperienceForHandoff` remains the producer only for actual server-to-browser transfers; necessary state application stays internal to its complete consumption operation. React provider/root expose optional, mode-agnostic, explicitly consumer-supplied `handoff?: ExperiencesHandoff`, replacing `initialization: { routeKey, handoff }` and `ExperiencesStateInitialization`. Within its existing effect, current optional React consumption observes `sdk.states.consent` and reinvokes the complete operation using the current browser route and one stable `isCurrent` lifetime guard forwarded into SDK state application/admission. Coalesced SDK work remains live while any joined caller is live; cleanup unsubscribes without destroying an injected SDK or cancelling accepted queue delivery. Basic optional consumption and the existing implicit page consent path must complete in Phase 6, with no dedicated facility or mode detector. This necessary API migration does not pull managed loading or other Phase 7 capabilities forward. Preserve accepted phases 1–5 and their historical evidence; record this correction as complete and explicitly accepted on 2026-11-02.

**Correction validation boundary:** Remove tests asserting rejected behavior and add focused maintained unit/contract tests at the owning layer, using local functions, spies and deferred promises without network calls. Cover identify/track-only and optional-final-page ordering/schema/limits, full aggregate ownership and React prop/export migration, replay-less state application and explicit page intent, page-only route deduplication and gated refusal, current consent/restamping/preview, content failure retaining usable replay, ordinary event-free same-ID Retry without repeated hooks/events/commit, and reset/destroy/supersession/late-response guards. Preserve cache/scope and existing queue/transport limits. No network tests, MSW, E2E, mock/server simulation infrastructure, dependency upgrades or frozen Live Preview edits. Earlier checks/review, including the 1008- and 1,011-test results, are historical and do not validate this revision. Current implementation, checks and review are recorded in the Phase 6 validation section. Phase 6 is complete and explicitly accepted on 2026-11-02; Phase 7 is implemented and awaiting user acceptance and its acceptance gate is satisfied. The later Phase 7 publication authorization below permits committing/pushing the reviewed state; it does not authorize a PR, history rewrite, merge or release.

The original pre-phase-1 repository baseline is `fab4f47cfd2da0ad6b761d577b71fdb01f8d41a7`; the table and preview inventory preserve that starting evidence. Phases 1–5 remain complete and accepted. Phase 6's earlier accepted/published head was `5db2ea217617f41fd84a7207780c2877b32c4cf7`, with PR #286 phase-6 base `19d529d1951678493ce00de8df3f5be7650d17a1`. The current revision at `b2720d8` is verified, complete and explicitly accepted on 2026-11-02; prior remedy evidence remains historical. Phase 7 is implemented and awaiting user acceptance.

| Area              | Existing foundation                                                                                                                                                         | Work required                                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| React rendering   | `packages/adapter-react`, including separate client/server renderers, registry definitions, node composition, design context, slots, preview hooks, and attribution helpers | Add runtime integration and automatic attribution while retaining the rendering contracts                                                         |
| Node requests     | `packages/node/src/contentful-experiences.ts`: stable SDK configuration and request-local `forRequest()` facades                                                            | Adapt to framework requests and share one facade across each route render                                                                         |
| Browser ownership | `packages/web/src/contentful-experiences.ts` and `web-singleton.ts`: one live Web SDK per JavaScript runtime                                                                | Add managed React lifecycle and shared host ownership; injected providers must leave construction and destruction to the application              |
| Live preview      | Optional Preview Session snapshot/subscription package; React hooks currently create its client separately; Runtime already owns a Preview API client and event policy      | Add optional runtime integration, one shared SDK preview source, and live-preview support in the three existing references                        |
| State and actions | Web's existing seven observables plus the approved shared preview state, interceptors, direct methods, and `packages/web/src/runtime.ts` snapshot contracts                 | Add React subscriptions, bound actions, readiness, and error handling                                                                             |
| Handoff           | Runtime validation; actual Node transfer producer; optional explicit Web consumption                                                                                        | Correct optional-page aggregate ownership and complete provider/root consumption; coordinate router startup without a separate initialization DTO |
| Next.js           | `examples/nextjs`: App Router, `next ^15.0.0` and React `^19.0.0`; free server fetching and a separately owned Web consent panel                                            | Add a public integration package and request/browser coordination; create Pages Router and production integration coverage                        |
| Packaging         | Nx, npm workspaces, per-package builds, local tarballs, and CI                                                                                                              | Add package/export checks and maintained example/reference builds without weakening server/client boundaries                                      |

Use Optimization's integration implementations at pinned commit `f76f1ff04df1b466c98fc6ce5db6b569f9212438` as the pattern reference. Port relevant ownership, subscription, action, request, and handoff mechanics, with the Experiences lifecycle corrections documented in [AGENTS.md](../AGENTS.md). XDA remains the content-selection authority; do not port Optimization's client-side variant-selection machinery.

The references retain their demo Experience choices solely for rendering-scenario comparison, using ordinary event-free fetch for later IDs and reusing plans. Official one-Experience-per-page support is unenforced; no SDK multi-Experience or cross-fetch guarantee applies. Preserve cookies, private responses, server HTML and optional explicit incoming handoff consumption.

### Existing React/Next.js preview support

React exposes these public preview and plan APIs:

| Adapter | Existing public API                                                                      | Implementation                                                                                                                                                                                                                             |
| ------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| React   | `useLivePreview`, `useLivePreviewExperience`, and the general `useExperiencePlan` helper | [Exports](../packages/adapter-react/src/index.ts); [combined hook](../packages/adapter-react/src/preview/legacy/use-live-preview.ts); [session subscription](../packages/adapter-react/src/preview/legacy/use-live-preview-experience.ts). |

`useLivePreview` composes the standalone Preview Session subscription with Core plan resolution; `useLivePreviewExperience` exposes payload/error state. These hooks currently operate without constructing or coordinating Node/Web runtime instances. `useExperiencePlan` also supports non-preview supplied payloads and remains a general rendering primitive.

React re-exports `fetchPreviewSession` and associated types/errors and currently declares the Live Preview package as a required dependency. Its free `fetchExperience` path also accepts Client's inline `preview`/`previewToken` options and host override; caller-supplied clients own their endpoint. Preserve the standalone package's public APIs, but migrate React's preview integration to runtime ownership and remove the mandatory preview dependency/import graph from normal React/Next.js entrypoints. Phase 1 defines the React import/hook migration; general supplied-plan rendering and `useExperiencePlan` remain supported.

A dedicated Next.js adapter package is not present. The current Next example uses React's standalone `useLivePreview` path in [LivePreviewExperience.tsx](../examples/nextjs/components/LivePreviewExperience.tsx).

## Existing designs and mechanisms to use

Implement the named mechanisms at the smallest useful scope. Preview is best effort: rely on the preview package for protocol behavior and future improvements. Do not add generic caches, exception-recovery frameworks, or exhaustive edge-case requirements. Port Optimization mechanics where applicable; add only the CDA/XDA adaptation needed by the current phase. Tests cover distinct owned behavior once; documentation states usage and limits concisely.

Start API and DX work by reading the relevant implementation and tests in the [Optimization source repository](/Users/charles.hudson/Projects/contentful/optimization), and by tracing the three existing Experiences reference applications. Optimization is the implementation model, not optional inspiration. Port its existing React/Next.js mechanisms, API conventions, option shapes, and usage patterns, adapting package names, types, and the Experience content model. Do not design an alternative first and compare it with Optimization afterward.

New mechanisms or architectural departures are permitted only where an inherent CDA/XDA difference requires them. XDA evaluates built initial events together with content and returns the selected plan plus profile ID; it does not commit that batch. Adapt Optimization ownership, source/presentation and stable root/Web replay-fallback APIs to this flow instead of emitting identify/page as a content prerequisite. Preserve its implicit page retry on consent changes without inventing explicit retry machinery. Keep Experiences lifecycle safeguards and the frozen Live Preview boundary; those constraints do not authorize unrelated redesign.

Trace each relevant Optimization flow through its implementation and tests before declaring a gap. For Next request integration, this includes `request-handler.ts` → `server.tsx`/`cookies.ts` → `app-router-request-runtime.tsx`/`app-router-request-handoff.ts` → the React provider, Web handoff hydration, and `trackCurrentPage`/auto-page emitter. Follow its standard Next hosting model and supported middleware, request/response, and browser boundaries. Do not introduce a custom server, a render-plan transport through request headers, an external continuation store, or a replacement ownership/event/lifecycle framework. Distinguish the identity available to a response boundary from later content-derived state instead of assuming Optimization requires all work to finish at that boundary.

Read Optimization at pinned commit `f76f1ff04df1b466c98fc6ce5db6b569f9212438`, as required by the repository's parity guidance. The adjacent checkout is the local source repository; its current working-tree contents may differ from that commit. From the Experiences root, use `git -C /Users/charles.hudson/Projects/contentful/optimization show <commit>:<path>` and inspect corresponding tests. If a newer design is needed, pin and record the revision being used rather than silently relying on an arbitrary checkout.

| Guide                            | Read first                                                                                                                              | Reusable design and implementation                                                                                                                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Optimization React adapter       | `../optimization/packages/web/frameworks/react-web-sdk/README.md` and `src/` at the pinned revision                                     | Managed roots, injected-instance providers, factory/binding conventions, runtime context, SSR snapshots, observable hooks, safely bound actions, content-loading presentation, route-page coordination, and tracking bindings |
| Optimization Next.js adapter     | `../optimization/packages/web/frameworks/nextjs-sdk/README.md` and `src/` at the pinned revision                                        | App/Pages server-client binders, request-scoped initialization, explicit-input APIs, request-context forwarding, cookie/response helpers, handoff envelopes, hydration policy, and initial-page ownership                     |
| Experiences Node reference       | [README](../implementations/node-sdk/README.md), `implementations/node-sdk/src/app.ts`, and its rendering files                         | Public Node configuration, `forRequest()`, request-local events and content loading; old workaround sequencing is historical input to phase 6 cleanup                                                                         |
| Experiences Web reference        | [README](../implementations/web-sdk/README.md) and `implementations/web-sdk/public/js/{app,control-panel,tracking,experiences}.js`      | Browser ownership, observable state/consent, visitor controls, page/content cycles, stale-result guards, automatic/manual attribution, sidebar attempts, and cleanup                                                          |
| Experiences Node + Web reference | [README](../implementations/node-sdk+web-sdk/README.md), `src/{app,cookies,shared}.ts`, and `public/js/{app,control-panel,tracking}.js` | Request identity/consent and response cookies, one full XDA aggregate, server-content preservation, browser takeover, one page/content owner, and continuity through navigation                                               |
| Existing Experiences packages    | `packages/{client,runtime,node,web,adapter-react}` public APIs, implementation, and tests                                               | Wire serialization, delivery, consent, interceptors, queues, singleton ownership, observables/snapshots, current-page and handoff methods, detectors, resolution, slots, and design props                                     |

Useful Optimization starting modules include React `provider/OptimizationProvider.tsx`, `root/OptimizationRoot.tsx`, `hooks/useOptimizationState.ts`, `hooks/useOptimizationActions.ts`, `auto-page/useAutoPageEmitter.ts`, `optimized-entry/OptimizedEntry.tsx`, and `optimized-entry/useOptimizedEntry.ts`. Inspect `packages/web/web-sdk/src/presentation/optimizationRootRuntime.ts` and its tests before inventing a root-ownership controller. For Next, inspect `app-router-server.tsx`, `app-router-client.ts`, `app-router-request-runtime.tsx`, `app-router-request-handoff.ts`, `pages-router{,-server}.ts`, `server.tsx`, `handoff.ts`, `cookies.ts`, and `request-handler.ts` with their tests. Adapter module paths are relative to each adapter's `src/`; the presentation-helper path is relative to the Optimization repository root.

During phase 1, make a concise reuse map from each proposed API/mechanism to its existing source and revision. Distinguish direct use, a port or adaptation, and a capability required specifically by the CDA/XDA difference. For every departure, name the exact Optimization mechanism inspected, the inherent CDA/XDA difference that prevents direct reuse, and the smallest necessary adaptation. A generic "missing capability" does not justify invention. Keep this evidence with the design and validate it in the owning implementation phase. This is design evidence, not additional acceptance metadata or an explanation required from the user.

The user has approved replacing per-resource SDK state with one shared preview source and thin binding. The new XDA instruction also authorizes removal/simplification of workaround-specific abstractions and future design assumptions through phase 6. Preserve unaffected rendering, ownership, state, consent, lifecycle, preview, privacy and cache contracts. Optional changes outside this cleanup remain separate proposals; the earlier requirement to retain every specified abstraction does not preserve obsolete workaround machinery.

The phase-1 design and [phase-6 cleanup plan](./react-next-runtime-xda-cleanup-plan.md) state the same corrected active APIs and sequences alongside their retained source/reuse evidence. The active responsibility boundaries are:

| Specified abstraction                         | Difference or existing mechanism to investigate before changing it                                                                                                                                                   |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared SDK preview source and thin binding    | Approved replacement for per-resource SDK state; adapt Optimization's existing source/presentation controllers to XDA plans, keeping framework/view presentation state                                               |
| Normal page/root and content ownership        | Reuse Optimization root activation/current-page tracking and source/presentation controllers; retain evaluated outcomes for genuine identity dependencies, without bug-specific content gates or page-recovery loops |
| Request preparation and handoff               | Reuse Optimization request memoization, preparation and handoff APIs; capture applicable state at supported boundaries without a mandatory full-plan barrier or bespoke `prepareExperiences` API                     |
| Integration handoff envelope                  | Selected plans, route ownership, and rendering policy alongside runtime state; compare with Optimization's browser handoff metadata                                                                                  |
| Component-root attribution bindings           | Nested Experience nodes, slots, and multiple DOM roots versus CDA entry presentation/tracking bindings                                                                                                               |
| Lazy preview initializer and SDK wrapper      | Frozen XDA Preview Session APIs; Optimization supplies the optional-package pattern, not this content protocol                                                                                                       |
| Registry factory and shared browser ownership | Registry binding for XDA resolution/rendering; reuse Optimization's managed/injected bindings and inspect independent-root lifetime requirements                                                                     |

Keep shared event, consent, identity, queue, state, and measurement mechanics in their existing runtime owners. Apply the cleanup plan's [stage-owner reuse constraint](./react-next-runtime-xda-cleanup-plan.md#initial-content-and-exact-submission) to the current consolidation; ordinary fetch remains plan-returning and only the actual Node transfer producer remains; Web producer, Node aggregate commit and content-reuse union/helpers are removed. Framework adapters provide the ergonomic lifecycle/request/rendering layer demonstrated by these references. Their demo routes, hard-coded Experience IDs, utility buttons, and diagnostic UI do not become SDK policy. Preserve Experiences' documented lifecycle corrections when porting Optimization code. XDA selects content here, so adapt content loading and resolution rather than copying Optimization's client-side variant-selection engine. Reference app glue should reveal what the adapter can simplify; it must not become a second runtime.

Borrowing source or design does not create a runtime dependency on the adjacent checkout or require customers to run both product SDKs. Port source into the Experiences package graph; keep Optimization source provenance and existing license notices where applicable.

## Target package and API structure

Retain `packages/adapter-react` as `@contentful/experiences-react`. Add `packages/adapter-nextjs` as `@contentful/experiences-nextjs`. Next depends on React and Node; React's browser integration depends on Web. Shared rendering continues to depend on Core and Design through their public APIs, with Delivery access through Client. The Next package re-exports the React APIs needed by Next customers through appropriate entrypoints so customers can install one top-level package.

Keep `@contentful/experiences-live-preview` as an unchanged optional implementation package. Runtime, Node, Web, and normal React/Next.js entrypoints must not require or eagerly import it, including through emitted declarations or re-exports. Define the SDK's loader/module contract structurally using shared SDK types; published SDK declarations must not require consumers to resolve the optional package. Deployment-controlled `import()` supplies its existing exports to the SDK-owned wrapper. Use supported build-time elimination for production bundle exclusion; a runtime condition prevents loading but does not by itself prove chunk exclusion. Require no custom import alias, new entrypoint in the frozen package, or deployment-specific consumer app.

| Public surface                       | Intended responsibilities                                                                                                  | Boundary requirements                                                                                     |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| React static/server                  | Registry and plan types, static/server rendering, design utilities, attribution bindings, composition primitives           | No live Web construction, Next dependency, or browser side effects                                        |
| React client                         | `createReactExperiences`, managed root, injected provider, state/action hooks, managed Experience, supplied-plan rendering | Preserve client directives; exclude server credentials and server-only resolvers                          |
| React host composition               | Explicit browser owner/controller and integration primitives used by independent React roots and non-Next.js hosts         | Share one runtime across separate React contexts; leave host-specific lifecycle wiring to the application |
| Next App Router server/client        | Bound server rendering, request-aware family, browser takeover, App Router tracking                                        | Server entries protect private configuration; client entries exclude Node and `next/headers`              |
| Next Pages Router server/client      | Request/response helpers, props handoff, `_app` browser owner, Pages Router tracking                                       | Server response handling stays outside browser imports                                                    |
| Next explicit-input server utilities | Application-owned data loading, supplied plans, explicit request context, static generation                                | Never read framework request state implicitly                                                             |

These are capability groups, not a requirement to export every internal helper. Finalize the root export behavior, exact subpaths, public types, and React/Next peer ranges in phase 1. Do not add an Edge runtime commitment merely because Optimization exposes one; keep Node-dependent entries explicit and reject unsupported runtime use clearly.

## Reference implementations and behavioral parity

Create two standalone reference applications alongside the existing implementations. Their observable behavior and layout should match the corresponding Experiences reference almost exactly while demonstrating the new public framework integration APIs.

| New application              | Behavioral baseline                                                          | Framework integration                                                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `implementations/react-sdk`  | [Web client-only reference](../implementations/web-sdk/README.md)            | `@contentful/experiences-react` managed browser owner, hooks/actions, and standard React renderer; content and events run in the browser       |
| `implementations/nextjs-sdk` | [Node + Web hybrid reference](../implementations/node-sdk+web-sdk/README.md) | `@contentful/experiences-nextjs` request helpers and React renderer; initial document content is server-rendered, followed by browser takeover |

Reference work is part of each phase that delivers its SDK capabilities. Establish the React reference in phase 3, add rendering in phase 4, ownership/hooks/controls in phase 5, then phase 6 cleanup and managed content/navigation in phase 7. Establish the Next reference with common server utilities in phase 9 and complete router integration/browser takeover in phase 10. Phases 8 and 11 are completion and parity checkpoints for the accumulated references; phase 12 checks their integration. Use App Router for the main Next reference and distinct Pages Router routes with `_app` in that same app, sharing configuration and presentation where server/client boundaries permit. Example migration follows in phase 13.

The runtime live-preview increment is delivered first in phase 2 through the existing Node, Web, and Node + Web references. Node demonstrates request-scoped session snapshot loading; Web demonstrates runtime-owned live updates; Node + Web demonstrates server preview content followed by browser subscription without duplicate startup work. Their normal flows remain the parity baseline, and their preview flows become the baseline for the downstream React/Next.js references.

Each phase delivers and inspects the reference portion supported by its APIs. Establish configuration, assets, setup/teardown, and operational documentation once, then extend them in place. An early reference need not contain later-phase features. Do not add temporary loading, identity, event, or lifecycle orchestration to bridge missing APIs, simulate completed behavior, or pull later-phase work across an acceptance gate. A capability's reference integration is complete in the phase that delivers it; the completion checkpoints confirm the full parity contract and resolve defects rather than defer planned implementation.

| Behavior               | Required parity                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Routes and content     | Home and Page Two, the same three default Experience IDs and optional local override, the same automatic/manual presentation selection, ordinary event-free fetch for later comparison IDs and plan reuse; no SDK cross-fetch guarantee                                                                                                                            |
| Rendering and layout   | Same theme and Utilities/split-content layout, card and named-slot presentation, actual component/template registrations, Rich Text rendering, and truthful baseline/partial-content feedback                                                                                                                                                                      |
| Visitor controls       | Grant/Revoke, Identify, Reset, Retry content, and Page Two's separate custom track action; `?userId=charles` means identify intent, not confirmed identity or authentication                                                                                                                                                                                       |
| Navigation and refresh | Direct URLs, back/forward, URL/title/active-link/focus updates, one page per applicable navigation, Identify/Retry joining pending initialization, no extra page for ordinary content refresh, and no cross-cycle private content cache in the references                                                                                                          |
| Consent and state      | SDK-owned state and persistence with startup consent/profile defaults unset; consent changes update Utilities without application-owned refetch/page calls; the SDK page emitter retains its implicit consent-change retry exception; the hybrid reference mirrors independent consent axes into request cookies and writes identity only with persistence consent |
| Corrected XDA contract | Built initial events in ordinary XDA fetches, actual server-transfer producer/optional explicit browser replay semantics and replay-independent rendering; demo loops exist only for rendering-scenario comparison                                                                                                                                                 |
| Tracking               | The same automatic view/hover/click behavior and separate manual-view section using actual attribution; default viewport/scroll clipping, multi-root grouping, and SDK-owned measurement, consent, queues, and teardown                                                                                                                                            |
| Event sidebar          | Optional browser attempt display, subscribed before initial page or hydration and retained across routes; count actual notifications, group only actual view/hover interval IDs, and never claim delivery or fabricate server attempts                                                                                                                             |
| Loading and lifecycle  | Corresponding loading, empty, error, partial-content, and retry behavior; stale-work guards; reset removes old attributed content before new visitor measurements; final cleanup and BFCache behavior preserve ownership correctly                                                                                                                                 |
| Hybrid startup         | Actual server content with JavaScript disabled; preserve initial HTML/content, hydrate applicable state and use normal matching-route replay/page ownership without startup content refetch; activation failure preserves server content and ordinary links                                                                                                        |
| Live preview           | One optional runtime initializer binds an Experience to a session; ordinary requests/rendering consume snapshots and updates, preserve initial content, suppress preview events/visitor mutation, and dispose stale work; unrelated Experience IDs retain their source                                                                                             |

Framework-specific rendering, asset loading, routing, and React hydration can differ internally. Record necessary observable departures in the parity evidence. Next prefetch, speculative rendering, or render retries must not commit extra page events; client navigation must have one event/content owner rather than both a server and browser cycle.

Keep both apps outside root npm workspaces, using installed local SDK tarballs and the maintained `scripts/install-implementation.ts`/Nx workflow. Add `implementation-react-sdk` and `implementation-nextjs-sdk` projects tagged `scope:implementation`, with setup/install/build/lint/typecheck, development, and scoped PM2 lifecycle commands. Integrate them into aggregate reference setup and explicit CI checks. Preserve app-local `.env`, keep `.env.example` credential-free, and maintain an explicit public configuration allowlist. Extend it only for documented browser-safe preview settings supported by the frozen package, including its token requirement and host overrides; do not assume the runtime's tokenless-proxy mode is available to session operations. Never serialize complete server configuration. Retain scoped ports/processes and local stylesheet provenance. Use public SDK exports; add no workspace source aliases, internal package imports, custom content generators, parallel profile stores, or application-owned observers.

Reference apps use real configured services. The new React/Next.js references use the standard renderer; the existing Node, Web, and Node + Web references retain their rendering approach while adopting runtime preview operations. Create no MSW, mock services, service simulations, or E2E infrastructure inside or outside the references, and limit changes to the existing apps to the authorized live-preview integration and targeted phase 6 XDA cleanup. Validate installed artifacts, local build/lint/typecheck, and representative live browser behavior; treat upstream variability as observed service behavior rather than simulated successful personalization.

## Required integration contracts

### Runtime ownership and hydration

SSR-only means that Experience content is fetched, resolved, and rendered on the server, including subsequent renders after navigation, refresh, identity changes, or preview updates. Content updates require a server round-trip. A browser SDK is optional and may handle analytics, consent, identity, interaction tracking, and applicable state handoff while preserving the server-rendered content. Its initialization must not activate browser-managed Experience fetching, resolution, or content rendering. Rendering mode does not determine page-event ownership; coordinate server and browser events through the initial-page contract below.

A managed application owner constructs Web after browser commit, never in React render or module initialization. Providers attach to that owner and clean up their own subscriptions. An injected provider neither creates nor destroys its SDK. Independent React roots can use one explicit shared owner, with separate contexts. Conflicting managed owners must fail clearly instead of silently borrowing the singleton.

Where browser content rendering is enabled, SSR and the first browser render use the same supplied plan and a stable snapshot of presentation state. Switching to the live runtime must preserve the initial content. Runtime initialization, handoff application, and the initial page decision have explicit readiness/error states. Failed setup, abandoned renders, Strict Mode effect replay, remounts, and late asynchronous work must not leak an owner or publish into its replacement.

Server snapshots and handoff state are transient initialization data. They must not become Web startup defaults accidentally: defaults can write consent/profile storage and have precedence over persisted choices. Server credentials, resolver functions, and client callbacks remain in their own modules.

### Runtime live preview and consumer DX

Live preview uses one optional runtime initializer and ordinary Experience operations. Bind the intended Experience ID to its Preview Session once; matching requests use that source, while unrelated Experience IDs retain their normal source. Do not require custom import aliases, per-call source selectors, preview-specific renderer branches, or a separately synchronized event-suppression flag.

The following is the target SDK API shape. Phase 1 finalizes the SDK option and loader contract while preserving this configuration and usage model; no new Live Preview package export is required. `previewEnabled` is the application's deployment/build setting, and `experienceId`/`sessionId` are its explicit binding inputs. The initializer is inert until runtime setup invokes it. The SDK maps configured credentials, endpoints, and resolution options into the subset accepted by the frozen package.

```ts
const livePreview =
  previewEnabled && sessionId
    ? async () => ({
        experienceId,
        sessionId,
        implementation: await import('@contentful/experiences-live-preview'),
      })
    : undefined;

// Node: the integration belongs to this request, not the process-wide SDK.
const request = nodeSdk.forRequest({ ...requestContext, livePreview });
const plan = await request.fetchExperience({ experienceId }, { config: registry });

// Web: fetch initial content explicitly; subscribe only for preview updates.
const sdk = new ContentfulExperiences({ ...browserConfig, livePreview });
if (initialPlan) renderPlan(initialPlan);
else renderPlan(await sdk.fetchExperience({ experienceId }, { config: registry }));
const subscription = sdk.subscribeToPreview(
  experienceId,
  { config: registry },
  ({ data, error }) => {
    if (data) renderPlan(data);
    showError(error);
  }
);
```

React's managed root supplies the same initializer during runtime creation and renders a normal `<Experience experienceId={experienceId} />`. Next's server binding passes it to the Node request facade; when browser content rendering is enabled, its browser binding initializes Web from browser-safe configuration and serialized plan/session binding data. Neither adapter constructs an independent preview client. General supplied-plan rendering and direct runtime access remain available.

The SDK-owned wrapper calls the existing public `fetchPreviewSession`, `createLivePreviewClient`, and `sendPreviewStatus` exports. `fetchExperience` remains the explicit initial/refresh operation: matching IDs fetch the bound session snapshot and adopt its already-resolved plan. Node opens no socket. Web owns one source/connection and publishes the normal SDK signal `states.preview: Observable<PreviewState | undefined>`: optional `experienceId`/`sessionId`, raw `ExperiencePayload` data, error, `live`/`static`/undefined status and content revision. Runtime's base retains no request/session/browser state; Personalization state stays unchanged.

`subscribeToPreview(experienceId, resolveOptions, listener): Subscription` is a thin binding that emits newly resolved `{ data?: PortableRenderPlan, error?: Error }` from matching raw updates. It performs no snapshot fetch and owns no per-view state. SDK operations share equivalent in-flight fetching/resolution and retain mode, event, profile and lifetime policies. Framework/view presentation owns its existing plan/loading/error state. Remove Web `observeExperience`, `observeExperienceChanges`, `ExperienceContentResource`, `ExperienceContentState` and `ContentObservable`; do not replace them with another custom resource framework. Future React/Next phases port Optimization's existing source/presentation controllers and use this binding. Current legacy React standalone preview hooks remain until their scheduled migration.

SSR-only adapters observe matching `states.preview` content revisions to request server refresh, without browser resolution or rendering. Status-only updates do not trigger resolution/refresh. Preserve server content until replacement and keep the shared connection stable across refreshes. Snapshot runtimes add an inert undefined preview state; all other states retain their contracts. `replaceLivePreview` remains the session replacement operation within fixed preview mode.

Preview integration remains best effort through the frozen package's public API. Runtime's canonical [preview limits](../packages/runtime/README.md#optional-runtime-live-preview) are unchanged; consumer READMEs link there and explain only their usage consequences. Keep protocol retry behavior in the package. The SDK owns event suppression, subscription cleanup, stale-result protection and refresh/reconnect loop prevention. An unavoidable first-payload SSR refresh does not gate completion. Use the [public exports](../packages/live-preview/src/index.ts), [snapshot helper](../packages/live-preview/src/fetch-preview-session.ts) and [subscription implementation](../packages/live-preview/src/preview-session.ts) as read-only evidence.

Document consumer behavior alongside its implementation: Runtime/Node/Web in phase 2, React in phases 3–5 and 7 and Next in phases 9–10; phase 13 reconciles those notes. Keep the frozen package's documentation unchanged and distinguish the approved contract from completed implementation.

Requested preview setup establishes policy before content, page initialization, tracking, or handoff work can run. Await lazy initialization where needed, suppress event submission and profile updates derived from preview content, and load that content without requiring a page event or profile. A failed or superseded initializer must not leak resources, publish stale data, or silently fall back to ordinary event-bearing behavior. Seed browser presentation with valid server plans without another startup snapshot fetch; retain usable content while reporting observable connection/resolution failures. Session replacement, refresh, reset, and destruction use runtime guards and the package's available unsubscribe cleanup; in-flight snapshot requests may finish but cannot publish obsolete results. Explicit consent/reset commands retain their documented semantics. Define how session-owned locale/parameters interact with ordinary request options; do not attach caller personalization events or the committed page to session operations.

### Content requests and refresh

Managed fetching and supplied-plan rendering use the same tree renderer. Framework/view content loading has its existing idle/loading/success/error state; Web's `personalizationRequestState` describes Personalization request outcomes and cannot serve as the content loader's status.

Ordinary content Retry refetches the same ID through ordinary fetch without events,
builders, event hooks, publication, admission or replay. Refresh creates no new
visitor intent; accepted incoming replay delivery retry remains queue-owned.
Initial URL identify pairs with the initial page; standalone Identify and CUSTOM
TRACK are fresh nonpage inputs to ordinary fetch, and navigation still carries
page intent. Current optional React/hybrid consumption observes SDK consent and
reinvokes the existing complete operation with a stable `isCurrent` guard; it adds
no extra page/refetch/CSR capture. Preserve that implicit page exception in future
managed loading/navigation without direct emission as an initial prerequisite or an
explicit retry scheduler. Later reference comparison IDs use ordinary event-free
fetch with no SDK cross-fetch guarantee.

A refresh deliberately dependent on an independent standalone identity action waits for that action’s evaluated outcome; offline admission alone does not establish evaluation. This applies only to that explicit dependency. Initial XDA fetching carries its own built events, and selected content never waits for their committing submission/replay. Profile-only reads can fail for provisional IDs. Same-ID Retry/later comparison fetching uses ordinary event-free fetch; infer no commit from global success, hydration or profile adoption.

Requests carry content locale, Experience identity, parameters, resolve context, and the relevant identity/consent revision. Superseded requests may finish transport work but cannot replace current content. Reset, consent withdrawal, owner replacement, and navigation invalidate pending presentation work. Application-owned loaders and caches remain supported without mandatory SDK fetching.

### Initial page responsibility

Keep `PortableRenderPlan` and `ExperiencesHandoff` distinct. Add a typed integration envelope carrying the route key, initial-event responsibility, and content-hydration policy alongside the validated runtime handoff. A plan does not prove a page event was committed. Necessary state application is internal to the complete aggregate operation; only admitted page-bearing intent marks a route tracked. Server request helpers and both browser router bindings must use the same pathname/search normalization rule for handoffs and page coordination. Equivalent query encodings such as `?q=hello%20world` and `?q=hello+world` must produce the same route key; reuse that rule across the existing request/router integration.

| Initial flow                     | Content/evaluation responsibility                                                      | Event responsibility                                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| CSR                              | Ordinary Web fetch with admitted arguments built once or raw built events; render plan | XDA-carried events remain uncommitted pending upstream support; no local handoff/workaround                   |
| SSR-only                         | Ordinary Node fetch and server rendering                                               | XDA-carried events remain uncommitted; no Node aggregate commit                                               |
| Actual hybrid transfer           | Node route-descriptor-only producer returns full handoff plus optional plan/error      | Optional explicit browser consumer commits server-supplied replay under current consent/queue/lifetime policy |
| Browser-local navigation/actions | Ordinary Web fetch absent a new actual server handoff                                  | Page for navigation; nonpage Identify/CUSTOM TRACK; no local producer or compensating commit                  |
| Same-ID content Retry            | Ordinary event-free fetch                                                              | No builders/hooks/publication/admission/replay; delivery retry stays queue-owned                              |
| Live preview                     | Bound session snapshot/updates, preserve content                                       | No visitor events/replay/mutation                                                                             |

For actual incoming handoffs, route and designated browser ownership suppress
competing startup submissions; a plan or adopted ID never proves commitment.
Preserve Web accepted-route/prepared-admission rules and the consent-change page
exception without another queue or fallback implementation.

### Corrected XDA contracts and cleanup ownership

Architecture/source reuse evidence remains pinned to Optimization `f76f1ff04df1b466c98fc6ce5db6b569f9212438`. Port root/provider lifetime, source/presentation, request memoization, route matching and handoff mechanics. The initial XDA adaptation below is the user's authoritative contract, not a newly demonstrated backend result.

Ordinary SSR uses Node fetch; CSR and browser-local navigation/actions use Web
fetch, accepting existing type-tagged arguments or raw built events with SDK
construction once. Only an actual hybrid server-to-browser transfer uses Node's
route-descriptor-only producer and optionally consumes the explicitly supplied
full handoff in Web/React, independently of display. Normal fetching needs no
handoff. Same-ID Retry/later comparison IDs use ordinary event-free fetch without
builders/hooks/replay; accepted incoming replay delivery retry remains queue-owned.
See [Runtime XDA contract](../packages/runtime/README.md#xda-preflight-and-profile-finalization); Phase 6 implementation, checks and review are recorded in the implementation plan; the user explicitly accepted completion on 2026-11-02.

Official support is one Experience per page, unenforced. Reference multi-ID loops compare rendering scenarios only; later IDs use ordinary event-free fetch and reuse plans. Later responses may update SDK profile, but do not alter an actual transferred handoff. This caller glue provides no SDK multi-Experience or cross-fetch guarantee; normal guards and in-flight sharing remain unchanged.

Preserve the pinned Optimization API mechanics and its product exception: the page emitter implicitly retries page on consent changes. Do not add an explicit consent retry scheduler, callback, state machine or content refetch. Other blocked events are dropped; allowlisted events are admitted rather than classified as blocked. Prepared replay uses the CURRENT browser consent gate for the whole batch, existing browser-consent restamping, and whole-batch refusal with gated fallback only for page-bearing intent. An integration's refused handoff is an integration outcome, not an SDK defect or a reason to bypass consent. Runtime consent stamping, final validation/interception, queues, reset/stale/lifetime guards and privacy boundaries remain owned by the SDK.

Client retains full built-event validation/passthrough, including `context.gdpr`, optional `context.page.title` and `page.query: string | string[]`, immutable input and supported auth/source-map mapping. Installed Delivery `1.0.0-dev.10` omits GDPR/title declarations and preserves unknown fields through POST passthrough; Client's local supplemental validation is still required. Preserve this Client contract; the temporary default Web-context omission is documented below and does not change raw caller-event or Client serialization contracts.

Ordinary SSR uses Node fetch; CSR and browser-local navigation/actions use Web
fetch, accepting existing type-tagged arguments or raw built events with SDK
construction once. Only an actual hybrid server-to-browser transfer uses Node's
route-descriptor-only producer and optionally consumes the explicitly supplied
full handoff in Web/React, independently of display. Normal fetching needs no
handoff. Same-ID Retry/later comparison IDs use ordinary event-free fetch without
builders/hooks/replay; accepted incoming replay delivery retry remains queue-owned.
See [Runtime XDA contract](../packages/runtime/README.md#xda-preflight-and-profile-finalization); Phase 6 implementation, checks and review are recorded in the implementation plan; the user explicitly accepted completion on 2026-11-02.

See [Runtime replay transport limits](../packages/runtime/README.md#replay-transport-limits): The actual Node producer retains raw final Client events, including query arrays, unchanged without a replay-compatibility check before XDA. Normal SDK builder XPAPI validation and Client XDA validation suffice; manually built/raw transmission remains consumer-owned compatibility risk. The existing wire type unions raw Client and normal SDK events without a new DTO. Existing receiving replay/schema/order/count/capacity/scope/cache/consent checks remain, and refused replay does not discard available content. Add no SDK safety-validation layer, custom transport or dependency upgrade.

Port Optimization's root/coordinator for route decisions and normal readiness, and its source/presentation controllers for supplied content, descriptor changes, loading/errors and stale-result protection. Experiences adapts those controllers to asynchronous XDA plans and adds retained-plan presentation, explicit refresh/Retry and Preview Session binding; the pinned source controller does not provide refresh/Retry commands or session binding. Basic optional React consent/lifecycle consumption belongs to Phase 6; managed React loading/navigation belongs to phase 7, Next utilities to phase 9 and router families to phase 10. No Runtime `content-cycle.ts`, combined content/event framework, mandatory complete descriptor inventory, `prepareExperiences` family or loader `pageResult` prerequisite is required. Capture applicable handoff state at supported boundaries and await actual selected-content dependencies without relying on descendant render order or creating a whole-plan readiness barrier.

Frozen Preview policy, transport and best-effort limits remain separate from ordinary XDA evaluation; reported ordinary fixes establish no new preview capability.

### Attribution and response safety

Provide one default tracked Experience DOM boundary and a supported binding to a customer-owned DOM root when a wrapper would change layout. Bind plan attribution to the container and node attribution to each node's outermost supported elements. Multi-root output, repeated presentations, portals, fragments, and root-prop/ref forwarding need explicit behavior. Do not wrap every registered component or build framework-owned interaction observers.

SDK-managed tracked requests must obtain a source map even when automatic observation is disabled and the customer uses manual controls or attribute opt-ins. Missing attribution must degrade safely. Supplied plans retain their available attribution without a hidden refetch.

Private personalized output, profile state, identity, and replay default to private/no-store handling at the response and fetch-cache boundaries. Runtime cache metadata validation is not HTTP cache enforcement. Public/static flows require explicit policy, no private handoff fields, and a complete permutation key where applicable. Serialize only browser-safe content and initialization data, validate resolver/metadata output, and exclude raw diagnostic errors and private Delivery diagnostic strings by default.

## Implementation phases

Each phase is a reviewable implementation increment with its own work checklist, completion evidence, and acceptance record. Relevant SDK phases include the corresponding permanent reference integration and representative live inspection. Acceptance covers the capabilities assigned to that phase, with later reference features remaining unimplemented until their phase. API examples used to settle contracts are part of phase 1; they do not reopen the accepted architectural decision.

Phases run strictly in numerical order. Phase 1 may begin immediately. Phase N may begin only after phase N−1 is complete and the user's explicit acceptance is recorded as **Accepted**. For reopened Phase 6, historical acceptance alone does not satisfy the correction gate; the current correction was explicitly accepted on 2026-11-02. This gate covers all work assigned to the later phase, including investigation, implementation, documentation, and validation. Work within the active phase may run in parallel when ownership is disjoint.

Agents check work items only after completing them and verify the stated completion evidence before presenting a phase for acceptance. The user defines what counts as an open issue case by case and will not accept a phase with open issues. Agents must not waive or reclassify open issues to declare a phase complete.

Only explicit user acceptance permits recording **Accepted** and setting the phase status to **Complete**. Acceptance requires no explanation, rationale, reviewer details, or date from the user. Proposal acceptance does not constitute acceptance of an implemented phase. Unaccepted, partially complete, or blocked phases keep every later phase **Not started**.

This working plan keeps current APIs, loading sequences and phase responsibilities consistent while preserving accepted phase 1–5 contracts and evidence. Phase 6 is complete and explicitly accepted on 2026-11-02; phase 7 is implemented and awaiting user acceptance; later phases remain not started. Agents must not mark acceptance in advance.

### Local work and explicitly requested Git publication

Keep implementation and validation local. No phase authorizes commits, pushes (including tags), PR creation, stack publication, or merges. Perform any such action only when the user explicitly instructs that specific action. Agents must not suggest, offer, or ask for authorization to commit, push, create a PR, or publish a stack. Starting, completing, or accepting a phase is not an instruction to perform any of those actions.

Keep changes unstaged during implementation and review. Stage only when preparing a ready commit explicitly requested by the user, or when the user explicitly requests staging. Phase completion or acceptance does not authorize staging.

Commits, pushes, PRs, and stack publication are not phase work items, completion requirements, acceptance gates, or open issues. Do not delay otherwise completed local work or solicit a Git action to satisfy this plan. Phase branch isolation applies to local commits as well as publication; it does not authorize either action. When a commit is explicitly requested, first create or use that code phase's own descriptively named branch, based on the preceding code phase (or the agreed integration base for the first code phase). Never commit a later phase onto the preceding phase's branch. Checkpoint-only phases need no empty branch; checkpoint code fixes use their own branch. PR/stack publication still requires a separate explicit instruction.

When explicitly instructed to publish, each phase with code deliverables is published on its own descriptively named branch as a separate PR in one GitHub Stack. The first code phase branches from the agreed integration base. Each later code phase branches from the preceding code phase, with the dependency represented in GitHub Stacks so the review diff contains that phase's changes. Do not combine all implementation phases into one branch or PR, or create empty branches for checkpoints without code changes.

Each PR identifies its phase, immediate dependency, changes, and relevant validation. Checkpoint phases that require code fixes use their own branch and PR. Publication does not mark a phase accepted or permit starting the next phase; the explicit sequential acceptance gates remain in force. Phase acceptance permits starting the next phase, not merging an individual PR. Shared stack updates have one owner, and published history is not rewritten without authorization.

Keep every PR unmerged until all phases are complete and accepted, every PR in the stack is approved, and the complete stack passes its final checks. Only on an explicit user instruction to merge, merge the entire stack together through the GitHub Stacks workflow as one coordinated merge; do not merge phase PRs independently. Satisfy applicable release/dependency prerequisites, including the new Next package's release baseline, before merging the complete stack. Phase-scoped validation covers the capabilities assigned to that phase; the example migration remains in phase 13 and is validated with the complete stack before merge. Publishing the stack or accepting a phase does not authorize merging PRs, pushing release tags, publishing packages, or deployment.

### Phase 1 Inspect existing designs and define public contracts

**Start gate:** No preceding phase; phase 1 may begin immediately.

**Design artifact:** [React and Next.js runtime integration phase 1 design](./react-next-runtime-phase-1-design.md). Its source/reuse map, unrelated accepted contracts and acceptance remain recorded. Active event/loading guidance and phase references are corrected in place to agree with phase 6; obsolete workaround instructions are not retained as implementation obligations.

**Work checklist**

- [x] Read the Optimization React/Next.js adapters and their underlying presentation helpers at the pinned revision, plus the Experiences Node, Web, and Node + Web reference implementations and the runtime APIs they call. Produce the reuse map described above before defining new APIs: identify the concrete implementations to port and justify each necessary departure by an inherent CDA/XDA difference. Trace complete relevant flows and their tests; do not infer missing capabilities from an isolated module or invent replacements for mechanisms already present in Optimization.

- [x] Define phase 2's SDK-side wrapper and simplified DX for Node, Web, React, and Next.js against the frozen package's existing public API. Specify the lazy module initializer, Experience/session binding, supported token/host and resolution-option mapping, preview policy, shared preview state, thin update bindings, explicit fetching and SDK source disposal, request/browser lifetimes, initial-plan adoption, and optional production packaging. Retain Runtime's canonical preview limits. Plan the React preview export/hook migration without changes to the Live Preview package or other framework adapters/examples. Use Optimization's optional package as packaging evidence only.

- [x] Write typed usage snippets for managed CSR, injected SDK with an application-supplied plan, SSR-only Next with optional browser analytics, hybrid Next, explicit/static Next, and independent React roots sharing an application-owned runtime. Keep these in the API design; do not turn them into separate runnable consumers. Specify the package export matrix, registry split between server resolution and browser rendering, owner lifetime, provider readiness, state-handoff and content-rendering controls, content fallbacks/retry, refresh policy, and route-event decision table. Validate implemented signatures through the owning package's typechecks and maintained apps in their implementation phases.

- [x] Specify the existing Node, Web, and Node + Web live-preview increments for phase 2 and the React-to-Web/Next.js-to-Node+Web parity scenarios, including content/layout, controls, navigation, consent, event counts, tracking, hybrid startup, live preview, and permitted framework differences. Assign scaffolding, presentation, controls, lifecycle, operations, and live inspection to the SDK phases that enable them: phases 3–5 and 7 for React and phases 9–10 for Next. Preserve the complete reference requirements for the phase 8 and 11 checkpoints. Select a usable increment for each phase without temporary orchestration or dependencies on later APIs.

- [x] Define ordinary request initialization, profile/handoff boundaries and plan reuse. Active integration targets one Experience/page; any retained demo loop is best-effort reference caller code and introduces no SDK cross-fetch requirement or response barrier.

- [x] Specify the App Router request sequence using the selected Next version's supported request/response APIs and the existing runtime contracts, following the pinned Optimization implementation as closely as the Experiences rendering model permits. Identify ordinary event/content ownership, how final profile state enters the handoff, and which response boundary persists identity before headers are committed, including visits without JavaScript. Assign event/content ownership for document requests, prefetch, RSC refresh, and client navigation. Implement the server portion in the Next reference in phase 9 and router/response integration and browser takeover in phase 10. Phase 1 requires the design, not a runnable prototype.

- [x] Define CSR, SSR-only and hybrid request/event ownership. Active correction: build initial page/identify for event-bearing XDA fetches, display selected plans independently of replay, and submit the exact batch once with the returned ID as continuation fallback. Ordinary refresh/Retry creates no new page/identify; consent-change page handling follows the pinned product exception. Phase 6 corrects Node/Web/hybrid, phase 7 implements managed React, and phases 9–10 implement Next.

- [x] Select supported React and Next versions from the existing examples and framework requirements. Record retained differences from the pinned Optimization patterns and identify any necessary Runtime/Node/Web capability changes. Choose representative builds and live flows in the maintained apps, with focused package checks for changed logic; do not create an exhaustive compatibility matrix or additional consumers.

- [x] Identify the source module and package that owns each new or changed behavior and inspect its existing tests before planning additions. Apply the test ownership and colocation rules below, including shared setup/teardown. Select only tests for uncovered owned logic and representative app checks for material integration risks; reuse existing evidence instead of maintaining a separate per-case validation registry.

**Completion evidence:** The source/reuse map supports the typed usage snippets and API inventory, including optional runtime live preview with ordinary consumer calls. Every new mechanism or architectural departure identifies the Optimization implementation inspected and the inherent CDA/XDA difference requiring the adaptation; unrelated inventions have been removed. Initialization, preview policy, initial-page outcomes, App Router response persistence, serialization, cache rules, and XDA request/event sequencing have explicit owners and a supported design using standard Next hosting. Reference increments, stacked code-phase delivery, and test ownership are specified. Existing coverage and representative app checks are identified. No unresolved signature or ownership decision blocks phase 2. No runnable consumer is created in this phase.

**Acceptance checklist**

- [x] Every work checklist item is complete.
- [x] The completion evidence above has been verified.
- [x] No open issues remain, as defined by the user.
- [x] The user has explicitly accepted the phase.

**Acceptance record**

| Field           | Value    |
| --------------- | -------- |
| Phase status    | Complete |
| User acceptance | Accepted |

### Phase 2 Implement runtime live preview and the existing references

**Start gate:** Phase 1 is complete and the user's explicit acceptance is recorded as **Accepted**.

**Work checklist**

- [x] Add the loader contract and integration wrapper in the SDK, consuming the unchanged package's public `fetchPreviewSession`, `createLivePreviewClient`, and `sendPreviewStatus` exports. Keep protocol, parsing, reconnect behavior, and editor messages in that package. Map only supported runtime configuration into its token/host and resolution options, with the documented limitations; do not inject an HTTP client, invent a new package export, patch internals, or promise tokenless/custom-header transport. Add no required preview dependency or eager import to Runtime, Node, or Web, including their declarations; preserve existing SDK module formats without changing the frozen package's packaging.

- [x] Implement request-scoped initialization/snapshot loading in Node and browser-scoped initialization/shared preview source in Web. Matching Experience IDs select the bound session; other IDs retain their source. Adopt the snapshot helper's resolved plan and use SDK/Core resolution for subscription payloads. Expose `states.preview` using ordinary signals/observables, explicit `fetchExperience` refresh and `subscribeToPreview` updates; share equivalent in-flight fetch/resolve work and own source cleanup. Keep initial plans/errors/diagnostics in the existing presentation without overloading Personalization state or retaining session/request state in the Runtime base. Establish preview policy before tracking, event/page initialization, content, or replay. Prevent preview-derived visitor-profile updates and obsolete publications after failure, replacement, reset, or destruction; do not claim snapshot HTTP cancellation that the public API cannot provide.

- [x] Add live preview to `implementations/node-sdk` through the public Node request API and conditional initializer. Keep its rendering approach, normal page/identify/content sequence, and existing routes. In preview mode, use the runtime's authoritative policy to omit the ordinary page/profile prerequisite and render a session snapshot without event submission; Node opens no live subscription socket. Supply documented local configuration and session/Experience binding inputs without generated content or new consumers.

- [x] Add live preview to `implementations/web-sdk` through the public Web `fetchExperience` and thin `subscribeToPreview` binding. Preserve normal controls, content cycles, and tracking. In preview mode, apply session updates to the existing renderer, show meaningful loading/error/status information, and use runtime-owned policy, refresh, stale-work handling, and cleanup. Application code must not create a second preview client, mirror preview flags, or manage socket/retry logic.

- [x] Add live preview to `implementations/node-sdk+web-sdk`: obtain the server snapshot through the Node facade, serialize a browser-safe initial plan and binding, and initialize Web with the optional integration before browser activity. Preserve initial HTML/content and start the subscription without a duplicate snapshot fetch, page, replay, or visitor-profile handoff. Preview content work does not write or expire visitor identity cookies as a side effect; explicit consent/reset commands retain their documented behavior. Keep response/cache/credential boundaries explicit and reuse the standalone references' runtime APIs. Preserve the ordinary hybrid flow.

- [x] Update the three references' manifests/tarball setup, build configuration, `.env.example`, public configuration allowlists, operational READMEs, and reference guidance for the SDK wrapper over the unchanged preview package. Preserve local `.env` values and scoped lifecycle commands. Document only supported browser-safe token/host settings; do not imply tokenless-proxy compatibility or expose management credentials/complete server configuration. Native browser modules use a served module URL or supported app bundle, not a bare package specifier. Reuse the package's existing artifacts/build workflow unchanged and perform consumer asset preparation in the references. Demonstrate enabled preview and production exclusion through those maintained apps; distinguish disabled loading from verified bundle exclusion.

- [x] Update Node/Web usage documentation for the shared preview source and thin binding, linking to Runtime's unchanged canonical limits. Keep consumer consequences concise and the frozen package README unchanged; upstream fixes do not gate this phase.

- [x] Add or extend colocated tests only for the new SDK-owned wrapper, policy, and lifecycle behavior, reusing setup/teardown and coverage. The Live Preview package's tests remain unchanged and may run as-is; do not add, move, or copy tests into that package or duplicate its protocol tests in the SDK. Inspect the three installed references for snapshots, updates, initial content, event/identity suppression, and representative observable failure/lifetime behavior within the frozen API limits. Report material limitations without MSW, mock services, E2E tooling, duplicate suites, or exhaustive matrices; ordinary unit-test doubles remain permitted under the testing scope above.

**Implementation evidence:** The shared-source replacement is implemented. Web's 461 browser tests and four SSR tests passed; the final fetch-method simplification passed 42 focused regression tests. Aggregate build, package tests, lint, typecheck and formatting checks passed, reusing unaffected results. Installed reference artifacts match current source. Live checks verified Node snapshots, one socket and received session payload per browser SDK, hybrid startup without browser content fetches/events, navigation, explicit refresh, and failed-refresh recovery. Frozen Live Preview files, other adapters/examples and local credentials are unchanged. Phase 2 is accepted.

**Completion evidence:** The SDK-owned wrapper integrates the unchanged Live Preview package in the existing Node, Web, and Node + Web references through ordinary Experience requests/rendering. Node adopts resolved snapshots; Web owns payload subscriptions and subsequent resolution; hybrid startup preserves server content without duplicate work. SDK policy, observable errors, invalidation, and cleanup work within the documented transport limits. The package's source, exports, manifest, build configuration, tests, and documentation are unchanged. Preview-disabled behavior and optional deployment are demonstrated, and reference documentation makes the supported configuration and limitations explicit for downstream adapters.

**Acceptance checklist**

- [x] Every work checklist item is complete.
- [x] The completion evidence above has been verified.
- [x] No open issues remain, as defined by the user.
- [x] The user has explicitly accepted the phase.

**Acceptance record**

| Field           | Value    |
| --------------- | -------- |
| Phase status    | Complete |
| User acceptance | Accepted |

### Phase 3 Establish packages and the React reference foundation

**Start gate:** Phase 2 is complete and the user's explicit acceptance is recorded as **Accepted**.

**Work checklist**

- [x] Create `packages/adapter-nextjs` with manifest, exports, TypeScript/build/test configuration, Nx project, and public React re-exports. Split React's static/server and client entrypoints while preserving its current unbundled build and client directives. Add Web as a dependency for client integration without making static rendering load the live browser implementation. Keep Next framework peers out of React.

- [x] Implement phase 1's optional-preview export/dependency strategy for React and Next.js. Normal entrypoints and declarations must not require the Live Preview package. Any retained compatibility entrypoint belongs in the SDK/React packages; do not add entries or move code into the frozen package. Preserve general plan helpers and provide necessary import migration. Reuse phase 2's SDK wrapper/contract and keep preview implementation out of normal adapter bundles without changing the Live Preview package or other framework adapters/examples.

- [x] Use `scripts/pack-package.ts`, Nx pack targets, and package-local import/type/export checks to validate published entries and declarations without generating consumer projects. Reuse the existing npm lockfile, package test tools, and CI conventions. Verify installed tarballs through reference setup/build as each reference increment lands. Register reference build/check targets with their foundations and example production-build targets during phase 13 migration; the current Build workflow does not explicitly build the Next example. Keep packaging helper tests beside their scripts and export tests in the package whose exports they check.

- [x] Establish the permanent `implementations/react-sdk` from the Web reference's README, guidance, source, theme, and content/interaction mappings. Reuse the phase-1 investigation and read any remaining material needed for implementation. Create its private standalone manifest, local tarball dependencies/overrides, app-local configuration, credential-free `.env.example`, React/build tooling, local theme/assets, and `implementation-react-sdk` Nx project. Add setup/install/build/lint/typecheck and scoped development/PM2 lifecycle targets, aggregate reference setup, and explicit CI checks. Preserve local values and isolate generated output and process ownership. Start the operational README and permanent app shell; add no placeholder SDK behavior for later phases.

**Implementation evidence:** React now publishes static root/`server`, explicit `client`, retained `custom-renderer`, and direct `web-sdk` entries with its unbundled ESM build and preserved client directives. The standalone preview hooks and their tests remain unchanged in source but are excluded from published output; Preview is a development-only dependency, with no normal JavaScript/declaration import. Next's `0.0.0` foundation publishes an empty root and public React server/client/custom-renderer/tracking re-exports, with Next 15.5/React 19 peers and no later-phase router stubs. The root lockfile has only the new workspace link/manifest and React dependency changes.

React's 132 tests and Next's 15 export/declaration tests pass. Both package builds, typechecks and lint pass; React retains one pre-existing unused-disable lint warning. Public declarations resolve with NodeNext and Bundler, static imports reject live Web/Preview loading, and client directives survive emission. Nx pack targets validate the archives through the existing helper. `implementation-react-sdk:setup` installs local public tarballs and builds successfully; installed app lint/typecheck and explicit entry imports pass with no Next dependency. Direct inspection verifies Home/Page Two, title/active-link changes, back/forward, the Web-derived theme/Utilities/split layout, and credential-free startup. Scoped PM2 serve/status/restart and API-free health work on port 3400; missing assets and environment paths are rejected. Bundle sources contain no SDK, Preview or Next modules. The app joins tag-based aggregate setup and explicit CI build/lint/typecheck checks. An independent read-only review found no actionable defects. Frozen Preview files, other adapters/examples, and existing local credentials are unchanged. The existing Next example's breaking-import migration remains assigned to phase 13. Phase 3 is accepted.

**Completion evidence:** Artifact and package checks cover exports, declarations, server/client entry separation, preserved client directives, and dependency versions. React's manifest and static entry have no Next dependency or live browser construction. The permanent React reference installs the public tarballs without Next, builds and starts its app shell, and has usable setup/lifecycle commands and initial operational documentation. Rendering and runtime integration follow in their assigned phases within this same app.

**Acceptance checklist**

- [x] Every work checklist item is complete.
- [x] The completion evidence above has been verified.
- [x] No open issues remain, as defined by the user.
- [x] The user has explicitly accepted the phase.

**Acceptance record**

| Field           | Value    |
| --------------- | -------- |
| Phase status    | Complete |
| User acceptance | Accepted |

### Phase 4 Add standard attributed rendering

**Start gate:** Phase 3 is complete and the user's explicit acceptance is recorded as **Accepted**.

**Specification assessment:** The phase matches the accepted design and current Core/React attribution contracts. The design specifies the default `div`/semantic or custom `as` Experience boundary, ordinary props/ref forwarding with optional named multi-root bindings, Optimization-compatible per-kind overrides, and normalized client root registration data/cleanup. Its phase-4 reference increment explicitly uses the supported free-fetch/supplied-plan path, without phase-7 initialization. Phase 3 already owns the app shell; this phase extends it. Server attributes remain serializable; refs and named binding functions are constructed within client composition boundaries where they would otherwise cross RSC. Unsupported root shapes and RSC forwarding constraints are documented alongside their implementation.

**Work checklist**

- [x] Extend the existing React client/server renderer and composition primitives with the default Experience boundary and component-root binding. Reuse Core's `getTrackingAttributes` and existing React node traversal/prop resolution. Preserve component/template lookup, default/design/content/resolver/slot precedence, context access, unknown-component fallbacks, errors, and supplied-plan updates. The same renderer accepts plans from ordinary fetching and runtime-backed preview updates; add no preview-specific tree traversal or renderer.

- [x] Support multi-root grouping and distinct DOM identity for repeated presentations. Document and validate root bindings that require DOM attribute/ref forwarding, including unsupported root shapes, rather than silently losing attribution. Keep source-map/attribution requirements available to managed loaders in phase 7 and server loaders in phase 9.

- [x] Provide Optimization's `clickable`, `trackViews`, `trackHovers`, and `trackClicks` controls through standard rendering/root bindings. Preserve real scopes and plan attribution when disabling any automatic kind, so manual views can coexist with automatic clicks/hovers. Supply normalized `data` through the optional client root callback for public `enableElement`/`clearElement` registration; remove the automatic/manual/none enum and redundant `renderRoot` surface. The application must not need a second tree traversal or measurement implementation to match the current references.

- [x] Extend the React reference's existing Home/Page Two shell and Utilities/split-content layout with actual component/template registrations, card/named-slot/Rich Text presentation, and automatic/manual sections. Use the same default Experience IDs and optional override, the standard renderer/root bindings, and real plans through the supported supplied-plan path. Support repeated presentations and manual-root forwarding with automatic per-kind overrides. Use ordinary attrs/ref forwarding for single-root reference components; retain named multi-root bindings as an advanced escape hatch. Remove the root-count/readiness panel and its app-owned collector. Do not duplicate traversal, add a custom content generator, or hide unknown incoming content types behind unverified assertions. Inspect the rendering and layout now; managed page/content sequencing belongs to phase 7. Update the same app's README with the available rendering behavior.

**Implementation evidence:** React now exposes Optimization-compatible `clickable`, `trackViews`, `trackHovers`, and `trackClicks` options on standard rendering and root bindings. Core scopes and plan attribution remain present when automatic kinds are disabled; manual callbacks receive SDK-selected `data`, and independent click/hover overrides coexist with manual views. The mode enum and redundant `renderRoot` surface are removed; `as`/ordinary root props handle semantic/custom roots. Named multi-root bindings remain optional, preserving stable refs, repeated presentation identity, balanced cleanup and the committed-snapshot stale-data repair.

The reference's single-root Card and Template forward ordinary HTML attributes/refs. A small registration wrapper preserves Fragment-only clickability outside the plain Card, while explicit supplied root props take precedence. No SDK root prop, app root collector, readiness panel or extra DOM wrapper is required. Installed live Page Two inspection verified real Rich Text/slot content and repeated plans: each manual presentation retains one plan boundary and three scoped roots with views/hovers/clicks set false; automatic roots inherit defaults. No readiness panel remains, and the reference still constructs no Web SDK until Phase 5.

Scoped SDK build/test/lint/typecheck passed: 155 React tests and 15 Next export/declaration tests. Installed tarball setup and reference build/lint/typecheck passed, as did changed-file formatting and whitespace checks. The existing React unused-disable lint warning remains. Independent source/document review found no functional defect; its checklist-consistency finding is resolved by this final evidence and completed work items. Frozen Preview/shared-runtime source and other adapters/examples are unchanged. The plan/design now require context SDK access and normalized-data manual DX in Phase 5 and the same managed `Experience` surface in Phase 7, with concrete snippets/type/reference checks and no consumer orchestration of XDA workarounds. These future implementations remain not started. Phase 4 is accepted.

**Completion evidence:** Existing rendering suites pass. Colocated React tests cover its attribution binding, repeated presentations, multiple roots, layout-sensitive root binding, and stable server/browser HTML. Core retains attribution-construction tests; Web retains detection, consent, and submission tests. The installed React reference demonstrates the standard renderer, real registrations, layout, slots, repeated plans, and automatic/manual root shapes without extra per-node wrappers or observers. Runtime-backed interaction wiring follows in phase 5 and coordinated live content/event behavior in phase 7.

**Acceptance checklist**

- [x] Every work checklist item is complete.
- [x] The completion evidence above has been verified.
- [x] No open issues remain, as defined by the user.
- [x] The user has explicitly accepted the phase.

**Acceptance record**

| Field           | Value    |
| --------------- | -------- |
| Phase status    | Complete |
| User acceptance | Accepted |

### Phase 5 Implement React ownership providers and hooks

**Start gate:** Phase 4 is complete and the user's explicit acceptance is recorded as **Accepted**.

**Specification assessment:** The preview staging overlap and readiness ambiguity are resolved by the linked transition contract. Phase 5 owns runtime/context/state setup with supplied-plan presentation; Phase 7 owns view-specific content controllers, preview plan binding/hook migration and route orchestration. Preserve Optimization's activation/terminal-barrier mechanics and the required Experiences snapshot/content and evaluated-identity safeguards.

**Work checklist**

- [x] Implement the bound React factory, managed owner/root, injected provider, snapshot-to-live transition, SDK access, readiness/error exposure, and state hooks including shared preview, using compatible Optimization provider/root/hook code as the starting point. Make SDK access follow `useOptimization` through `useExperiences()` so normal integration does not pass `sdk` through components; bind the registry once and keep manual SDK construction/destruction optional for application-owned paths. Keep the new runtime context separate from the existing per-render/node context. Bind event and command actions safely for destructuring and retain the underlying return types, consent checks, interceptors, and transport semantics.

- [x] Wire the optional lazy preview initializer into managed runtime setup outside React render and support injected runtimes already configured for preview. Observe `states.preview` through the state hook and own only provider/state subscriptions in this phase, reusing Phase 2 initialization, preview policy, source replacement and cleanup. Keep optional loading in consumer configuration. View-specific resolved-update binding, content/presentation controller ports and any retained convenience-hook migration belong to Phase 7; add no temporary preview presentation layer or separately constructed preview client to bridge that gate.

- [x] Implement the [activation/barrier transition contract](./react-next-runtime-phase-1-design.md#phase-56-boundary-and-observable-readiness), using pinned Optimization `OptimizationProvider` activation and `BeforeInitialPageSequence` terminality as the examples. Type context access with existing `WebExperiencesRuntime`, preserve the cached snapshot/supplied content on setup failure, and keep `isLive`, `isContentReady` and provider `error` distinct from preview state and per-view loading. Phase 5 releases only its binding/state-hydration barrier, introducing no page/fetch/replay coordinator. Pending/failed lazy preview, static preview and session replacement do not wait for first payload or change root readiness; SDK policy/operations already guard that work. Cover these cases, observer ordering and snapshot-to-live/injected replacement manual registration cleanup with ordinary doubles.

- [x] Adapt observables with `useSyncExternalStore` and stable cached snapshots: Web clones `.current` values, so repeatedly returning `.current` as the React snapshot would create unstable object identities. Handle immediate subscription emissions, store replacement, server snapshots, concurrent rendering, cleanup, and nullish/false state values. Event hooks must not re-emit historical events as new runtime attempts.

- [x] Expose shared owner primitives for independent roots. Separate structural configuration requiring deliberate owner replacement from mutable locale/consent/actions, including changes to preview/session configuration. Preserve reset, consent-withdrawal, teardown-flush, singleton-release, and late-response safeguards. React requests the appropriate runtime lifetime transition; runtime policy and source cleanup remain in their owners.

- [x] Integrate the bound factory, shared owner/provider, state hooks, and available actions into the React reference. Add consent display and Grant/Revoke with startup consent/profile defaults unset, SDK-owned persistence, and no application-owned consent-subscription page or fetch calls; the SDK page exception is integrated in phase 7. Wire automatic tracking and explicit manual-view registration to actual renderer attribution, with no app-owned observers. Replace the earlier `ManualContent({ sdk, plan })` pattern with context-based SDK access and the bound supplied-plan renderer; use `trackViews={false}` (and other per-kind overrides only as intended), consume SDK-normalized `data`, and return cleanup. Require no root collector/map, consumer attribution selection, custom traversal or lifecycle framework. Verify SDK replacement/snapshot-to-live registration cleanup through the binding owner. Use ordinary DOM attrs/refs for single roots; named multi-root bindings remain optional. Add the optional attempt sidebar with an early retained subscription, actual notification counts and interval grouping, safe labels, and age/subscription cleanup. Establish shared registration cleanup and final-exit/BFCache ownership. Inspect available controls, state, ownership, and cleanup; content-cycle actions and page initialization arrive in phase 7. Extend the operational README in place.

**Implementation evidence:** The pure registry factory, managed root, injected provider and public `/host` bindings are implemented using the pinned Optimization ownership/provider mechanics. Managed construction occurs after commit; injected and independent-root providers never destroy their shared SDK. Cached snapshot presentation survives setup failure, async state-only hydration has a terminal readiness barrier, observers attach before hydration, and obsolete completions cannot update replacement bindings. Structural managed configuration stays captured until keyed replacement; locale remains mutable. Runtime's existing cache-safety and receiving-scope assertions run before handoff-derived snapshot state reaches SSR children, using the actual captured/injected receiving scope.

The eight named state hooks and generic selector cache observable emissions and server snapshots for `useSyncExternalStore`; eleven receiver-safe actions preserve underlying signatures/results. Context SDK access, a registry bound once, per-kind flags and normalized callback data demonstrate the manual-view DX without SDK prop threading, root collectors or application observers. Provider tests cover snapshot activation and injected replacement registration cleanup, Strict Mode, abandoned setup, failed construction/observers, pending hydration teardown, state hydration rejection/supersession, independent roots, static preview and preview-state changes without payload/readiness gating. Shared test-root lifecycle support is excluded from publication. Post-review cleanup now separates locale failures from activation/hydration errors and centralizes live-state publication without changing the public APIs or lifetime guards. Locale correction clears only its own failure, including a correction equal to the SDK locale, and hydration settlement cannot erase it. Context and factory assertions are colocated with their owners; factory checks observe rendered behavior rather than component-function/JSX identity. The replacement case executes all eleven actions against the new SDK, and bound-renderer DOM identity is captured before activation. The redundant standalone preview-hook scenario is consolidated into the provider sequence. Focused mutation checks now detect the previously surviving stale-action-receiver and activation-remount defects; controlled regression cases cover both successful and rejected hydration alongside locale recovery.

The installed React reference now activates one managed owner, exposes independent consent controls with startup defaults unset, registers manual views through context, and retains early attempt diagnostics with actual notification counts, interval grouping and age cleanup. The reference leaves its owner and attributed DOM alive for Web's document-exit interaction completion and final hide flush; browser teardown releases the document, BFCache retains it, and deliberate unmount/replacement within a live document uses renderer/provider cleanup. This follows the existing Web/hybrid document lifetime rather than canceling the SDK drain from an earlier host listener.

Final React tests passed (223), as did the unchanged Next export/declaration suite (15), scoped builds/lint/typechecks, Bundler/NodeNext public-DX compilation, installed tarball setup and reference build/lint/typecheck, formatting and whitespace checks. Independent review's cache/scope-before-SSR and document-exit ordering findings are repaired, including the remaining direct-SDK documentation instruction. Live Home/Page Two inspection verified real supplied content/Rich Text/slots, repeated presentations, independent consent changes and persistence across document navigation, withdrawal without replacing displayed plans, and actual view-attempt notifications from the automatic/manual presentations. The original live check did not record the available runtime profile/identity or its restoration source, so it does not establish tracking without that prerequisite or that consent alone enables interaction attempts for a fresh visitor. Analytics dispatch and attempt publication require an available runtime profile/identity. Attempt observation does not establish transport delivery; this phase still introduces no visitor initialization, managed content, view-specific preview presentation or route-page sequence. Preview policy/transport remain with their existing owners and source-state observation is covered with ordinary doubles. Frozen Preview/shared runtime source, other adapters/examples, local credentials and Git publication state are unchanged. Phase 5 is accepted; Phase 7 remains not started.

**Completion evidence:** Colocated React tests cover its managed/injected ownership decisions, subscription and action bindings, stable hydration snapshots, and cleanup. Select relevant Strict Mode, failed setup, remount, and replacement cases for the new React logic. Injected providers never destroy the SDK, subscriptions clean up, and React callbacks cannot publish into a replaced owner. The installed reference uses one shared owner and demonstrates state/consent controls, attribution registration, sidebar subscriptions, and cleanup for the available capabilities. Package type/DX checks and the reference demonstrate a concise manual-view example using context SDK access, a registry bound once, per-kind overrides and normalized data, with no SDK prop threading or root collector. Preserve the explicit injected/application-owned escape hatch; ordinary automatic rendering requires no manual registration callback. Readiness evidence covers the specified activation/hydration failure and replacement transitions, preview-state observation without first-payload gating, and preservation of supplied content; no view-specific preview controller or route/page orchestration is required for this phase. Rely on Web's tests for its singleton, browser queue lifecycle, reset, persistence, and late-response guards; reuse setup/teardown helpers and report material limitations.

**Acceptance checklist**

- [x] Every work checklist item is complete.
- [x] The completion evidence above has been verified.
- [x] No open issues remain, as defined by the user.
- [x] The user has explicitly accepted the phase.

**Acceptance record**

| Field           | Value    |
| --------------- | -------- |
| Phase status    | Complete |
| User acceptance | Accepted |

### Phase 6 Remove obsolete XDA workarounds

**Start gate:** Phase 5 is complete and the user's explicit acceptance is recorded as **Accepted**.

**Cleanup artifact:** [React and Next.js runtime XDA cleanup plan](./react-next-runtime-xda-cleanup-plan.md). It defines the corrected target, affected owners, preserved contracts and validation for the existing Node/Web/hybrid flow and minimal SDK support.

**Specification assessment:** Phase 6 is complete and explicitly accepted on 2026-11-02. The verified transfer-only correction supersedes the historical companion/commit/reuse design below. Current implementation, proportional checks and acceptance review are recorded here. Phase 7 remains not started; its Phase 6 completion/acceptance gate is satisfied.

**Current correction work checklist (complete and accepted)**

- [x] Remove Node aggregate commitment, the Web producer and handoff-as-content
      re-evaluation union branches/helpers; retain Node's route-descriptor-only producer
      solely for actual server-to-browser transfers.
- [x] Use ordinary Node SSR and Web CSR/local navigation/action fetch, accepting
      existing type-tagged arguments or raw built events with SDK construction once.
      Keep SSR/CSR noncommit as the upstream service bug, without workaround/force flag.
- [x] Make Web/React handoff consumption optional, mode agnostic and explicitly supplied;
      keep real hybrid bootstrap replay independent of display. Current React effect and
      hybrid bootstrap observe `sdk.states.consent` and reinvoke the complete operation
      with one stable `isCurrent` guard reaching SDK state/admission; any live coalesced
      caller keeps work live. Cleanup preserves injected SDKs and accepted queue work;
      no dedicated facility, mode detector, extra page/refetch or CSR capture.
- [x] Make same-ID Retry/later reference comparison fetches event-free; verify no builders,
      event hooks, publication, replay or resubmission. Delivery retry stays queue-owned.
- [x] Preserve pinned identity/consent/cache/schema/queue/lifetime guards; verify actual
      Node transfer's sequential hooks and unchanged raw final Client events/query arrays
      without server replay-compatibility checks; preserve content and existing receiving
      validation/admission. SDK builder XPAPI and Client XDA validation suffice for normal
      inputs; raw transmission is consumer-owned risk and the existing event wire union
      adds no DTO or SDK safety layer.
- [x] Keep the three examples' explicit `context.page.title` omitted while retaining
      `properties.title` and GDPR through narrow inputs, without shared-builder stripping.
- [x] Align downstream React/Next flows, including actual hybrid content fetch without
      optional prefetch producing the full result reused by presentation/root.
- [x] Run proportional owner/import/SSR/type/lint/build and maintained-reference checks;
      root records actual results and fresh review. Earlier evidence does not satisfy this gate.
- [x] Obtain explicit user acceptance before declaring Phase 6 complete or starting Phase 7 (accepted on 2026-11-02).

**Realignment verification:** All 1,021 affected tests passed (Client 69, Runtime
179, Node 62, Web 477 plus SSR 4, React 230). SDK typecheck/lint, builds,
declarations, installed-reference setup/checks, syntax, formatting and whitespace
checks passed. Actual React-to-Web cases verify automatic page handling after
consent grant and cancellation before state/admission on handoff removal or
injected-provider unmount. SDK tests verify shared callers, scoped fallback
interception, and retained route bookkeeping for already-admitted replay.
Sequential producer hooks and unchanged raw query arrays are covered at Node.
The three actual example helper payloads preserve properties title/GDPR, omit
context title and pass Client XDA validation. A builder probe confirms that normal
query-array builder input is already rejected by the XPAPI builder schema.

Basic optional-handoff lifecycle is required and addressed in Phase 6: use
Optimization's consent-reactive page-owner invocation and effect-local liveness
guards before state publication and event admission. SDK lifetime and
already-admitted queue work remain SDK-owned. No dedicated retry facility,
app-mode detector, extra server validation layer or manual-transmission safety
mechanism was added. The receiving SDK's existing admission checks remain.
Managed descriptor/loading/preview-presentation lifecycle belongs to Phase 7;
Next request/response and router lifecycle belongs to Phases 9–10. Those future
capabilities do not defer correctness of the current consumption API.
Scoped review found no remaining production defect after fallback liveness and
accepted-page bookkeeping were corrected. Four references were restored and
their health endpoints returned success. Live visitor submissions were not
exercised. Phase 6 is complete and explicitly accepted on 2026-11-02; Phase 7 is not started.

**Acceptance review (2026-11-02):** Fresh uncached checks at `b2720d8` passed all 1,021 affected tests, SDK builds/lint/typechecks and lint/typechecks for the four installed references. No live XDA/XPAPI submissions were exercised in this review. The small-capacity replay/fallback concern was withdrawn as an acceptance blocker after comparison with Optimization `f76f1ff0` and verification that the default Personalization capacity is 100 and automatic interactions use the separate Analytics queue. Successful fallback completes the current initialization under the pinned policy; this concern requires no SDK change. The documented XDA preflight and page-context limits remain accepted. The user explicitly instructed that Phase 6 be marked complete and accepted.

**Historical validation and size record (before the current audited fixes; not current validation):** 1,011 affected tests passed: Client 69,
Runtime 179, Node 59, Web 474 plus SSR 4, and React 226. SDK typecheck/lint and
scoped source formatting checks passed. Four reference setups refreshed the real
packed artifacts and declarations; installed-reference lint/typecheck passed.
All four previously running references were restored and their local health
endpoints returned success.
Fresh review found no remaining production defects after the consent refusal fix.
Eligible page intent after denial/grant uses the existing page fallback; blocked
nonpage replay stays dropped, with no dedicated retry facility. Live XDA/XPAPI
visitor submissions were not exercised; the service's forced-preflight limitation
remains tolerated without a workaround.

Physical source lines were captured before that historical revision, including the inherited
uncommitted work and untracked tests. Compared with that exact snapshot, that
historical revision removed 211 SDK production lines, 110 reference lines and 190 test lines
net (511 code lines total). These figures exclude documentation and generated
artifacts; they describe scope rather than proving architectural quality.

**Historical superseded correction work checklist (not current requirements)**

The prior consolidation misunderstood the user's contract. Its results below are
historical and superseded; they establish neither remedy correctness nor acceptance.
The user's remedy governs these requirements. The earlier SDK/installed-reference checks and review below are historical and do not validate this revision.

- [x] Retain Node-request/Web `fetchExperienceForHandoff` with `{ readonly routeKey: string } | ExperiencesHandoff`: consumers supply existing type-tagged builder arguments or raw built XDA events; the owner builds only admitted arguments once and finalizes before content work; ordinary `fetchExperience` keeps its plan-returning shape and accepts the same native builder arguments. Content failure retains usable replay, independently of display.
- [x] Use one full aggregate with one designated Node `commitRequestHandoff` or Web `hydrateAndTrackCurrentPage` owner. Remove standalone XPAPI `prepareRequestHandoff`, separate `createRequestHandoffFromData` producers and public `hydrateHandoffState`; necessary state application stays internal. XPAPI remains actual commit transport.
- [x] Permit identify/track-only replay with an optional single final page. Never synthesize a page or force emission. Matching nonpage replay has no page fallback or route marking. Replay-less aggregates apply internal state and return `{ accepted: false }` unless explicit `buildPayload` supplies page intent. Only page-bearing intent participates in route deduplication; page-bearing refused replay retains gated fallback.
- [x] Make every reference visitor intent, including standalone Identify and custom track, use consumer-supplied XDA events and consume the new intent's aggregate once without adding a page.
- [x] Migrate the existing React provider/root boundary to `handoff?: ExperiencesHandoff`, replacing `initialization: { routeKey, handoff }` and `ExperiencesStateInitialization`. Lifecycle consumes the complete operation using current browser route; preserve accepted phase-5 ownership/snapshot/supplied content/readiness/cleanup. Managed loaders and other Phase 7 work remain not started.
- [x] Retain the first aggregate for later-ID/Retry content-only reevaluation, rejecting simultaneous caller events; preserve original batch/ID/route/locale with no new builders/hooks/publication/admission/commit. Current consent gates retained replay whole, with immutable restamping; preview sends no personalization.
- [x] Commit Node batches to retained aggregate `profileId`, never later facade identity. Retain Web accepted replay identity across A→B→serialized-A within owner lifetime for page/nonpage batches; refuse old A without state/event republication, recommit or fallback. New visitor/action intent needs fresh message IDs; reset/destroy clear history, consent withdrawal does not renew admission. Test these decisions at their owners.
- [x] Validate exact finalized schema/equality/order/count commit compatibility before XDA; incompatible companion inputs throw without a selected plan. Keep ordinary fetch's wider XDA contract and separately supplied-plan usability when untrusted-envelope replay is refused. Add focused no-network cases for both boundaries.
- [x] Preserve browser identity capture, ordinary provider-first policy, consent/preview/schema/cache/scope, queue capacity-before-publication, reset/destroy/supersession and late-response/teardown guards. Publish prepared attempts after whole-batch admission and before transport; carry the original operation revision through interception and final admission/publication. Accepted replay never falls back or resubmits because delivery fails.
- [x] Replace rejected-behavior assertions and add focused maintained no-network unit/contract tests for optional-page/nonpage/replay-less behavior, complete aggregate/React migration, current consent/preview/schema, content failure, Retry retention and lifetime. No MSW, E2E, network tests or frozen Live Preview edits.
- [x] Document official support for one Experience fetch per page, without code enforcement. Reference multi-ID loops remain only for rendering-scenario comparison; future managed/Next requirements must not advertise them as supported product usage or a cross-fetch guarantee.
- [x] Reconcile authorized owner/reference docs and all active plan/spec/future-phase requirements without discarding useful content or accepted phases 1–5 evidence. Run proportional owner/import/SSR/type/lint/build checks and record actual results.
- [x] Complete fresh correctness/design review and validate the corrected test assertion; no production findings remain.
- [ ] Obtain explicit user acceptance before Phase 7 begins; acceptance/completion remains withdrawn.

**Historical superseded remedy validation evidence (root-reported; not current completion):** All
1008 affected tests passed uncached: Client 69, Runtime 181, Node 53, Web 475 plus
SSR 4, and React 226. Five-owner typecheck/lint passed uncached. Four-reference setup
passed in 27 uncached tasks, including build, packing, declarations and installation;
eight installed-reference lint/typecheck tasks passed uncached. All four previously
running PM2 apps were restored through their scoped serve targets; all four local
health endpoints returned success. No live XPAPI/XDA
events were exercised. Final fresh correctness/design review has no production
findings; its sole incorrect Runtime test assertion was fixed and validated afterward.
Technical implementation, validation and review are complete. User acceptance and
phase completion remain withdrawn pending explicit acceptance; Phase 7 stays gated.

**Historical growth against rejected HEAD `5db2ea217617` (root-reported):** These counts cover
the full uncommitted correction, including inherited work; no exact task-start code
snapshot is available to isolate this assignment's source contribution. SDK: 15
production files, +798/−634 (net +164). References: six source files, +284/−160
(net +124). Tests: 16 tracked files, +1207/−1144 (net +63), plus the new 342-line Web
test file (total net +405). The new Node concern suite is 365 lines, down from 520;
Web is 342, down from 368, after native-input DX and reentrant regression coverage
and removal of broad duplicate matrices. The remaining additions support existing
builder arguments, exact aggregate admission/identity and their focused regressions.
Line counts describe scope and growth; they are not evidence of quality or correctness.

**Historical rejected consolidation report (superseded; not remedy validation):** The prior report claimed consolidation/validation complete and no review findings; those completion/correctness conclusions are withdrawn. Ordered SDK builds passed in five tasks, existing owner SDK tests in eight tasks including Web SSR, typecheck/lint in nine tasks, and four-reference setup/packing in 27 tasks. Consolidation removes 93 production physical lines and 92 nonblank, comment-excluded code lines measured with the TypeScript scanner, including owner, validator and delivery reductions; all new helper imports/exports are counted. A temporary no-network probe confirmed deeply equal XDA evaluation/re-evaluation/commit events, two hooks only for the two initial events, the original envelope pointer, `accepted: true` and `preflight: false`. Public APIs, retention and isolation are preserved through existing owners without a generic framework/class/store. Final React compatibility passed in 18 tasks and lint/typecheck across four installed references passed in eight tasks; plans are formatted. Prior correction evidence stays historical. Fresh remedy validation/review and explicit acceptance are pending; Phase 7 is not started; no current CI, live check or Git publication is claimed.

**Prior correction validation (root-reported local results before consolidation):** Ordered SDK builds passed for Client, Runtime, Node and Web. Existing affected-owner suites for Client, Runtime, Node and Web passed in eight Nx tasks, including Web SSR. Companion-reuse verification comes from source review and the temporary contract probe below, rather than newly added maintained test cases. Owner typecheck/lint passed in nine tasks. Final setup for all three existing references passed in twenty tasks; reference lint/typecheck passed in six tasks. SDK artifacts were packed and installed in the temporary validation checkout. Independent review reported no unresolved findings. The latest installed-reference lint/typecheck recheck passed in six tasks, and the latest React compatibility test/typecheck/lint checks passed in eighteen tasks after type narrowing. These results apply to the prior correction snapshot and do not validate the consolidation. Those prior consolidation checks are historical and do not validate this remedy; fresh correctness/design review and explicit acceptance remain pending. User acceptance remains pending and Phase 7 is not started; no new live-service result or CI pass is claimed.

**Prior temporary companion-reuse contract probe (root-reported before consolidation):** An inline executable probe with mocked raw transport and no network used `node:util.isDeepStrictEqual` and canonical JSON comparisons. It recorded `hooks=2`, `evaluations=2`, `reuseDeepEqual=true`, `commitDeepEqual=true`, `reuseWireEqual=true`, `commitWireEqual=true`, `sameEnvelope=true`, `accepted=true`, and `preflight=false`. Plain `JSON.stringify` differed only in property order; the deep and canonical wire comparisons confirm preservation. Together with source review, this verifies finalized-event reuse, original-envelope retention and admission to the mocked committing call. No new maintained test files/cases or code were added; this probe is not a live-service result.

**Historical superseded remedy acceptance checklist (not current gates)**

- [x] The technical implementation checklist is complete with the authoritative contract.
- [x] All 1008 affected tests and five-owner typecheck/lint pass uncached; results are recorded.
- [x] Four-reference setup (27 tasks), installed lint/typecheck (eight tasks) pass uncached and all four prior processes are restored; no live XDA/XPAPI events were exercised.
- [x] Final correctness/design review has no production findings; the sole incorrect test assertion is fixed and validated.
- [ ] The user explicitly accepts the remedy.

**Current acceptance record**

| Field                   | Value                                                          |
| ----------------------- | -------------------------------------------------------------- |
| Phase status            | Complete                                                       |
| User acceptance         | Accepted                                                       |
| Acceptance date         | 2026-11-02                                                     |
| Reviewed implementation | `b2720d8`                                                      |
| Working state           | Acceptance recorded locally; no new Git publication authorized |
| Phase 7 gate            | Satisfied; not started                                         |

**Historical specification assessment (withdrawn/superseded accepted head `5db2ea217617`; superseded for current correction):** Phase 6 is complete and explicitly accepted. The implementation is committed and force-pushed as `5db2ea217617`; PR #286 is open and its CI passed. Phase 7 is not started. Existing producer/sender/validator extensions and ordinary fetch/preparation/state-only behavior remain the scope; demo loops are best effort outside the SDK.

**Temporary default Web context:** One temporary default Web-context workaround: `getPageProperties` omits `title`, `hash`, `width` and `height` until XDA accepts them, with one temporary comment at the provider. Runtime EventBuilder retains the original `properties.title` fallback required by XPAPI; only `context.page.title` respects a provider omission, with explicit page context remaining caller-owned. There is no request map or Web builder wrapper. Raw caller-built XDA events and Node/Client fields remain preserved; custom providers and explicit arguments are caller-owned. The three Next.js/SvelteKit/Angular helpers narrowly omit title from their explicit `context.page` inputs while retaining `properties.title` and `context.gdpr`; no shared-builder stripping is added. Historical Web validation at `5db2ea217617` recorded default context excluding all four rejected fields and restored XDA content. That earlier wire verification confirmed required `properties.title` is retained and default context title is omitted; full raw caller context remains a backend limit. See [Runtime transport limits](../packages/runtime/README.md#replay-transport-limits); record actual results without claiming full-shape live success.

**Historical validation:** Aggregate build/test/lint/typecheck across 13 projects and formatting passed. Owner tests passed: Runtime 170, Node 72, Web 464 and Web SSR 4 (710 total). All three references were refreshed through setup and passed lint/typecheck; services are restored. Final repacked Web startup sent three XDA requests (200) and one XPAPI page commit (200), omitting `context.page.title` while retaining required `properties.title: ''`; context page contained the five accepted fields. The Identify control sent three XDA requests with `[identify, page]` in the best-effort demo loop, then one XPAPI identify-only batch (200), with no extra page. All three real Experiences, slots, Rich Text, manual roots, the actual profile and identified variants/ordering displayed. These are scoped ordinary Web observations; no new preview inspection is claimed. Full raw title/hash/dimensions remain a backend limit, and the temporary default-provider workaround is not an upstream fix.

**Historical work checklist**

- [x] Correct existing Node/Web/hybrid initialization: build page/optional identify once, pass the batch to ordinary XDA fetching, render selected content independently and submit actual intent once through the existing pipeline. Keep lightweight best-effort caller loops for the demo IDs and plan reuse; add no SDK chaining support or stronger response barrier.

- [x] Verify existing owner extensions: optional replay on Node `createRequestHandoffFromData`, public Web `sendPreparedExperienceEvents`, direct identify/track-only admission while handoff validation retains its required final page, authoritative top-level profile ID for replay, final-page-only route marking and unchanged state-only precedence. Preserve consent/queue admission, metadata validation and ordinary lifetime/cache guards; add no capture DTO, new sender or SDK framework.

- [x] Modify existing Node/Web/Runtime test cases for producer replay/profile semantics, identify-only admission, final-page route marking, blocked/preview outcomes and lifetime guards using simple doubles. Retain existing metadata/interceptor/consent coverage. No network unit tests, application test harness, duplicate suite, MSW/E2E or frozen Live Preview changes.

- [x] Reconcile affected production/helper declarations in their owning packages, SDK/reference/example READMEs and AGENTS guidance with these corrected plans. Preserve useful APIs, contracts, diagrams and unrelated use cases. Phase 6 does not implement managed React/root/page exception/reference integration; phase 7 does.

- [x] Run corrected local owner/reference checks for supported built-event submission, existing producer replay/profile semantics, identify-only admission, final-page route marking, CURRENT consent/refusal and ordinary lifetime safety. Inspect actual reference/service outcomes proportionally; best-effort demo loops need no cross-fetch proof. Retain the temporary default Web-context omission and report actual live results; no network unit tests, new maintained consumers or MSW/E2E tooling.

**Historical completion evidence:** The corrected implementation, owner checks and refreshed-reference setup/lint/typechecks are complete. Ordinary live Web content is restored with the temporary default-provider omission; raw caller context remains subject to backend limits. Existing API/lifetime/consent semantics and best-effort demo scope remain intact. Live Web wire verification is complete and the user has accepted phase completion with the documented limits. Commit `5db2ea217617` is published in PR #286; phase 7 is not started.

**Historical acceptance checklist**

- [x] Corrected implementation and affected usage documentation are complete.
- [x] Corrected local owner/reference checks passed; scoped live Web evidence and backend limits are recorded.
- [x] The user has accepted phase completion with the documented temporary workaround and remaining backend limits.
- [x] The user explicitly accepted the earlier head; this is not acceptance of the current correction.

**Historical withdrawn acceptance record**

| Field           | Value                                       |
| --------------- | ------------------------------------------- |
| Phase status    | Complete                                    |
| User acceptance | Accepted                                    |
| Working state   | Committed and force-pushed (`5db2ea217617`) |

**Historical publication record:** [Commit `5db2ea217617`](https://github.com/contentful/experiences/commit/5db2ea217617f41fd84a7207780c2877b32c4cf7) is the head of [PR #286](https://github.com/contentful/experiences/pull/286), stacked on #276. [CI run 41322526440](https://github.com/contentful/experiences/actions/runs/41322526440) passed for this exact head. The PR remains open and unmerged; phase acceptance does not authorize merging or release.

### Phase 7 Implement managed content and CSR page coordination

**Start gate:** The current Phase 6 correction must be complete and explicitly accepted by the user. This gate is satisfied by the explicit acceptance recorded on 2026-11-02.

**Specification assessment:** The Phase 7 baseline, approved API refinements and maintainability work are implemented and validated; user acceptance remains pending; its Phase 6 correction completion/acceptance gate is satisfied. The user clarified on 2026-11-02 that ordinary SSR/CSR XDA noncommit is tolerated absent blocking errors and that capacity/refusal wording must follow the accepted SDK fallback behavior. Preserve accepted Phase 5 APIs, attribution and preview. Port source/presentation and stable root/page mechanics from Optimization `f76f1ff0`, using ordinary Web fetch and optional explicitly supplied server handoff consumption through existing Web replay/fallback. Content display remains independent of admission or HTTP success. Do not add emit/skip APIs, hook-owned first-route skipping or terminal-attempt route marking.

**Work checklist**

- [x] Add the managed `Experience` surface and React request hook/controller alongside the supplied-plan renderer, porting Optimization's existing source/presentation controllers and consuming existing Web `fetchExperience` for the officially supported one Experience fetch per page and the thin `subscribeToPreview` binding from phase 2. Bind the registry once, request source maps for tracked ordinary rendering, and provide loading/error/presentation callbacks, retry, and explicit refresh. Forward Optimization-compatible per-kind tracking props and the optional existing root callback through the same bound `Experience`, so automatic and manual content use one managed surface without a custom `ManualContent` orchestration component. Preview opt-in is runtime configuration; `<Experience experienceId={experienceId} />` uses the same rendering API in both modes. Preserve initial content and retain framework presentation state and SDK-owned resolution without introducing a second custom resource framework.

- [x] Port the view-specific source/presentation controller, retaining the pinned source controller's descriptor/SDK identity, request status/version and disconnect guards. Add explicit refresh/Retry invalidation for the current descriptor: advance the request version and reset its status before fetching again, retaining the last usable plan and rejecting obsolete results. Updating unchanged options after success or error does not refetch in the pinned controller. Bind/unbind resolved preview updates according to the effective React request/resolve descriptor; these commands and Preview Session bindings are Experiences adaptations. Use activation/source setup and per-view content state for XDA presentation; do not carry over Optimization's variant-selection/request-success or `beforeInitialPage` presentation gates. Migrate any retained preview convenience hooks onto the same runtime-owned thin binding instead of constructing standalone preview clients. SDK in-flight sharing covers effective request/resolve dimensions and identity revision without crossing visitors; opaque inputs skip sharing. React keeps its existing presentation state, prevents obsolete/unmounted views from committing, and starts explicit fetch/binding work after commit. Binding never fetches a snapshot or duplicates SDK transport/lifetime guards.

- [x] Consume Phase 6's Web `hydrateAndTrackCurrentPage` complete aggregate operation with fallback only for page-bearing refused replay or explicit page intent and existing accepted-route tracker. Do not extend `trackCurrentPage` with an `initialPageEvent` emit/skip API or maintain a second route tracker in React. Queue-capacity refusal remains retry-eligible while the complete operation returns `{ accepted: false }`; accepted eligible page fallback completes the current initialization without resubmitting the original refused batch. Consent-blocked supplied replay is terminal, with only the current eligible page using the existing `trackCurrentPage` fallback after grant. Only admitted page work marks the route accepted, and accepting B permits later page tracking for route A only with fresh intent/message IDs; it does not permit re-admitting serialized aggregate A.

- [x] Port router-neutral root/page ownership with explicit route inputs and accepted readiness APIs from `f76f1ff0`. Keep one stable root/page sequence across replay and nonreplay navigation; `buildPagePayload` supplies page-builder inputs. For ordinary managed CSR/navigation, the owning loader carries page/optional initial URL identify intent through the existing fetch `personalization.events` options, with SDK construction once and no synthetic XPAPI commit. Tolerated XDA noncommit needs no accepted-route mark or commit-success prerequisite; reserve Web accepted-route bookkeeping for actual replay and explicit page/fallback operations. A matching replay supersedes a pending optional initial callback, and its late completion must not emit a competing page. Delegate replay/fallback and accepted-route decisions to Web; consent-reactive invocation retains eligible page refusal without an explicit retry scheduler or blocked nonpage replay. Preserve navigation/reset/replacement guards and display selected content independently of page terminality. Next router bindings remain in Next; preview payload/socket state does not determine root readiness.

- [x] Implement managed loading for the officially supported one Experience per page using existing source/presentation owners and ordinary Web fetch with SDK-owned event construction once. Optional incoming handoff consumption is explicit and mode agnostic, not a loader prerequisite or locally generated result. Retry refetches the same ID without events/builders/hooks/replay. Preserve supplied-plan/injected paths, in-flight sharing, content-failure presentation and lifetime guards; reference later-ID comparisons use ordinary event-free fetch without SDK guarantees.

- [x] Coordinate ordinary XDA request intent through the stable root/page owner; connect actual incoming handoff replay and explicit page/fallback operations to the existing Web tracker. Matching replay supersedes pending callback work and prevents a competing ordinary page. Replay admission or fallback resolves through `hydrateAndTrackCurrentPage`; only actual admitted page work records acceptance. A plan, provisional profile, state-only hydration or a terminal callback does not mark a route accepted. Admission does not depend on rendering. Capacity refusal remains retry-eligible while the complete operation returns `{ accepted: false }`; an accepted eligible page fallback completes initialization without resubmitting the original refused batch. Accepted replay is not resubmitted or followed by fallback on HTTP failure. Preserve reset/navigation/replacement guards and truthful outcomes without a second queue or ownership framework.

- [x] Use the runtime's preview policy/readiness to bypass ordinary page/identify initialization for preview content. Session updates, refresh, failure reporting, and cleanup use explicit SDK fetching and the shared source/thin binding; presentation retains usable content. Preserve server/supplied initial plans without a duplicate startup fetch and keep unrelated Experience requests on their own sources. A preview-mode event refusal is not a content initialization failure. Add no separate preview renderer branch or source selector to consumer code.

- [x] Complete the React reference's managed Home/Page Two content and navigation through the new public loader and normal root/page coordinator. Demonstrate one registry/root binding and `<Experience experienceId={id} />`; manual views use the same managed component, context SDK access and normalized registration data. Keep SDK orchestration out of consumer root/ref code. Do not reintroduce root-readiness panels, SDK prop threading, per-component fetch effects or app-owned tracking state. For retained demo comparison IDs, use a lightweight caller loop with ordinary event-free later-ID fetches and plan reuse; official support is one Experience per page, unenforced. Initial URL identify pairs with page intent; standalone Identify and Page Two CUSTOM TRACK use fresh nonpage ordinary Web fetch. Navigation still carries a page, Reset invalidates old work, and same-ID Retry has no events/builders/hooks/replay. Preserve optional explicit server handoff consumption, replay-independent display, pinned consent-reactive page and replay/fallback rules, direct URLs/back-forward and URL/title/active-link/focus updates. Add phase 2's conditional preview configuration and session binding through ordinary Experience components and runtime-owned loading/subscriptions. Show preview status/errors, preserve usable content and verify event suppression/source replacement. Preserve SDK state/persistence, remove old attributed content before reset measurements, and complete loading/empty/error/partial-content, tracking/sidebar and shared lifetime behavior.

- [x] Build and inspect the installed React reference against Web for the capabilities completed in phases 3–5 and 7, following phase 6 cleanup, including ordinary and preview content, controls, page/content counts, automatic/manual measurements, refresh/recovery, reset, and teardown. Reuse phase 2's runtime/protocol evidence and check the new React bindings only. Keep runtime mechanics in the SDK and fix defects in their owning layer. Maintain setup/build/lint/typecheck/lifecycle commands and the operational README. Carry results into phase 8 without another consumer or duplicate suite.

**Approved refinements and maintainability work (2026-11-02)**

Complete the five API refinements before structural cleanup, then demonstrate that
consolidation preserves their behavior and the accepted runtime contracts.

- [x] Add `onExperienceResolved` and `onExperienceError` notifications for current
      committed presentation. Follow pinned Optimization callback timing and avoid
      obsolete/unmounted notifications. Report errors even alongside retained usable
      content; DOM-root registration stays separate from whole-Experience notification.
- [x] Make `useExperiencesContext()` a discriminated union: `isLive: true` exposes
      the concrete Web SDK; false retains the snapshot-compatible runtime. Preserve
      snapshot import safety and its absence of fetch/resolve methods; remove consumer
      capability checks/casts made unnecessary by the live discriminator.
- [x] Accept React nodes or functions for loading and error fallbacks. Preserve
      the existing error function's `ManagedExperienceResult`/Retry access, automatic
      rendering and the full-state `children(result)` escape hatch.
- [x] Add a discriminated high-level `Experience` source: authoritative supplied
      `experience` or managed `experienceId`/optional `initialPlan`, with invalid mixed
      inputs rejected by types. Supplied mode performs no hidden fetch, resolution or
      preview binding. Keep pure `ExperienceRenderer`/server rendering available and
      preserve tracking props, root callbacks and supplied/managed transitions.
- [x] Add `initialPagePayload` as a static page-argument convenience with
      `buildPagePayload` taking precedence. Follow the pinned root's payload shorthand
      semantics through the existing owner, without another tracker/submission path;
      document that route-varying payloads must be updated or use the builder.
- [x] Reorganize the React adapter by responsibility and consolidate adjacent
      checks/facilities with the same timing or inputs. Reduce duplicated descriptor,
      presentation, lifecycle and mapping logic; use smaller patterns where they
      preserve error ordering, guards, cleanup and public behavior. Keep exported
      entrypoints/client directives stable, tests colocated with complete owners and
      runtime policy/transport in existing SDK owners. Compare production code size
      and responsibilities before/after; lower line count alone does not prove quality.
- [x] Simplify the React reference using the refined public APIs. Remove redundant
      orchestration, effects, state mirrors and casts; move genuinely reusable SDK
      lifecycle/request concerns into the appropriate SDK layer. Keep routes, literal
      visitor intent, app configuration, UI state and comparison-only later-ID loops
      application-owned. Preserve content/layout, controls, consent, preview, tracking,
      direct/back-forward URLs, reset ordering, sidebar and document/BFCache lifetime.
- [x] Complete the integration corrections exposed by independent review:
      preserve current relevant preview errors with successful snapshots and recover
      valid source activation after validation refusal; keep failed comparison views
      bound and render diagnostics from current presentation. Add a minimal optional
      managed `initialError` seed so application-owned failed snapshots establish a
      terminal initial outcome without a duplicate startup fetch, while preview
      binding and explicit event-free Retry remain available. Supplied mode still
      performs no I/O; do not add dummy plans or a resource framework.
- [x] Run focused owner/type/DX/import checks after each semantic boundary and final
      proportional SDK/reference validation and independent defect review. Preserve
      no-network unit tests, frozen Preview and accepted service limitations. Refresh
      installed reference artifacts and inspect representative real behavior without
      new consumers or simulated services.

**Publication authorization:** After implementing/refactoring and validating these
changes, the user explicitly authorizes staging, committing and pushing the current
`feat/react-managed-content` branch to save this work. Preserve its Phase 6 base and
stack isolation. This authorizes no PR creation, history rewrite, merge, release or
Phase 8 acceptance. Save the requested plan/design changes as reviewable work too;
exclude credentials, app `.env`, generated assets and installed dependencies.

**Completion evidence:** Managed and supplied-plan modes use the same renderer and use SDK fetching and the shared preview binding through existing source/presentation controller ports. Colocated React tests cover presentation selection/preview binding, presentation, refresh/retry commands, supplied-plan adoption, and router page ownership. The installed reference demonstrates ordinary and preview content through the same Experience API, including conditional package loading, live updates, error/status presentation, and cleanup. Ordinary startup/navigation and recovery retain their page rules; preview loads without visitor initialization or event submission. SDK source/binding, delivery, consent, and protocol guarantees remain tested by their owners. Planned React reference functionality, including preview integration, is implemented before phase 8. View/controller tests prove initial-plan preservation, preview setup failure/replacement without a root-readiness/socket dependency, and ordinary terminal outcomes without fabricated evaluation success. Type/DX checks and the reference demonstrate concise automatic and context-based manual managed usage, without hand-built fetch/subscription/page coordination; corrected XDA loading uses existing runtime owners, with a built initial batch and no replay/commit/identity display gate; demo loops exist only for rendering-scenario comparison and without root-binding boilerplate.

Reuse Phase 6's existing owner checks for finalized-batch retention, optional-page replay with page-bearing-only fallback, capacity-before-publication, identity precedence and refusal/lifetime semantics; add focused maintained no-network regression cases for these corrections and remove tests asserting rejected behavior. Phase 7's controller checks remain scoped to its own new presentation/binding decisions: same-descriptor refresh/Retry invalidation, retained usable plans, preview bindings and stable root navigation/callback supersession. Reuse lower-layer evidence; no emit/skip or post-terminal mark-accepted tests are required.

**Baseline implementation and validation evidence (2026-11-02; before these refinements):**
The public bound/unbound `Experience` and `useManagedExperience` surfaces are
implemented. The view controller ports pinned descriptor/SDK/version/disconnect
mechanics, adds event-free refresh/Retry, retains usable content, validates matching
preview descriptors and binds only after commit. Plain request/metadata comparison
snapshots detect in-place changes without altering SDK argument identity. Lazy
preview readiness does not inherit ordinary locale/source-map defaults into a
matching session, and visitor-consent withdrawal does not cancel preview content.
Obsolete legacy independent-client hooks/tests have been retired.

The stable root coordinates ordinary XDA intent and optional actual supplied
handoffs without another route-admission tracker. Initial joins are pending-only
and guarded by route, identity and policy; standalone callbacks lose their client
authority on supersession while later page decisions and consent fallback remain
eligible. Reset suppresses old handoffs consistently. Web now rejects ordinary
content returned after reset, withdrawal, destruction or independent profile/identity
replacement, while permitting its own intercepted XDA profile adoption. SDK queues
and accepted replay remain owned by their existing layers.

Final aggregate build/test/lint/typecheck passed in 49 Nx tasks, reusing unchanged
cached owner evidence. Final formatting and whitespace checks passed. Installed
React tarball setup passed in 21 tasks; its production build/lint/typecheck and
scoped lifecycle/health checks passed. The final aggregate reference refresh
completed all 27 underlying setup/install tasks; all four installed references
passed lint/typecheck in eight tasks, their scoped processes were restored and
all four API-free health endpoints returned HTTP 200. Enabled preview is a lazy chunk; a disabled
production build of this same reference contains no optional Preview package source.
Independent root and managed/reference reviews have no unresolved SDK findings.
No frozen Preview, other framework/example, dependency-version or lockfile changes
were made. All work remains unstaged; no Git publication is authorized or performed.

Direct live inspection verified real Home/Page Two content, named slots/Rich Text,
automatic/manual repeated presentations and measured view/hover/click attempts,
URL/title/active-link/focus/back navigation,
initial identify+page, standalone identify-only, custom track-only, navigation page,
event-free Retry/later comparisons and reset without synthetic initial commitment.
Observed XDA content requests returned HTTP 200. Preview session
`3SBBvnbJUpzTQHzytTuZ0D` loads a snapshot, receives live source data/status, preserves
usable content through refresh/reset and emits zero visitor event attempts. Its
matching initial snapshot is fetched once; later comparison IDs stay event-free,
and socket plan replacement does not refetch unrelated IDs. Current unit checks
cover errors, replacement, stale completions and refused/accepted operations without
network calls. SDK protocol evidence from Phase 2 is reused rather than retested.

**Accepted service limitation (user clarification on 2026-11-02):** Insights rejects
an XDA-adopted ID-only profile with HTTP 400 / `ERR_INVALID_DATA`, requiring
`stableId`, `random`, `audiences`, `traits`, `location` and `session`. The installed
Optimization API client's `PartialProfile` and `BatchInsightsEvent` schemas explicitly
accept `{ id }`; the SDK does not fabricate the missing fields. Complete XPAPI
profiles produced observed Insights HTTP 200 responses, while fresh ID-only profiles
produced admitted view/click attempts whose delivery failed. The user explicitly
instructed that this be recorded as a tolerated service limitation. Content and
preview remain usable; attempt notifications do not prove delivery. This does not
verify whether Insights validates profile existence, and future XDA commitment
support alone is not claimed to fix the profile-shape mismatch. No synthetic commit,
extra initialization API, profile fabrication or upstream deployment was added.

**Final refinement and maintainability evidence (2026-11-02):**
The five API refinements and the minimal managed `initialError` seed are complete.
Supplied and managed modes share one controller/renderer path, preserving same-plan
DOM, local component state, refs and root registration across transitions. Request
comparison and mapping, presentation fallbacks, and callback cancellation/error
handling are consolidated. Runtime activation/page ownership lives in `runtime/`;
content source/presentation and registry binding live in `experience/`, with tests
colocated and public entries unchanged. Preview errors remain alongside successful
snapshots, validation refusal can recover, failed comparison seeds retain preview
ownership, refresh stays outside initialization joins, and consent grant respects
a pending standalone initial callback. Independent bounded reviews found no
remaining actionable defects after these fixes.

Final aggregate `npx nx run-many -t build test lint typecheck --exclude=tag:scope:implementation` passed all 49 tasks (40 cached). The adapter
passed 330 tests across 25 suites, including committed notifications, Strict Mode,
source transitions, seed recovery and obsolete binding guards; the reviewer also
passed 85 focused tests and network-free recovery probes. Published imports,
SSR safety and public DX under Bundler/NodeNext resolution passed. Installed React
setup passed 21 tasks (8 cached); production build/lint/typecheck passed three
scoped tasks. A disabled-preview production build excluded all optional Preview
package sources; the original `.env` was restored, and the enabled build/scoped
server and API-free health check passed. Final formatting and whitespace checks
passed before the authorized commit. No frozen Preview, other framework/
example, dependency-version or lockfile changes were introduced.

Direct inspection of the final installed app reconfirmed real Home/Page Two
content, Rich Text/slots, repeated automatic/manual presentations and measured
attempts. Ordinary startup sent identify+page, navigation page only, custom action
track only, and Retry/later comparison requests no events. Reset followed by back
navigation fetched fresh baseline content with the expected URL/title/active-link/
focus behavior. Preview loaded one matching snapshot (HTTP 200), reached live
source status, displayed usable content and emitted zero visitor attempts. New
seed-error and preview-error recovery decisions use focused no-network owner
checks; no live fault simulation or additional consumer was created. Existing
XDA noncommit and ID-only Insights limitations remain tolerated as recorded above;
notifications still do not prove delivery.

Production TypeScript counts include every helper and exclude tests, fixtures and
generated declarations. The reference decreased from 1,134 to 1,054 physical lines
and from 1,085 to 1,006 nonblank lines across 10 files. The source/presentation
consolidation decreased its API-refined baseline from 727 to 706 lines, including
all recovery fixes; bytes increased from 26,830 to 27,985. Across the whole adapter,
the new APIs and correctness guards increased the prerefinement baseline from
3,696 to 3,777 physical lines and from 3,419 to 3,491 nonblank lines across 36 files.
These figures demonstrate narrower responsibility/duplication reductions rather
than claiming an overall adapter-size decrease or performance improvement.

**Acceptance checklist**

- [x] Every work checklist item is complete.
- [x] The completion evidence above has been verified.
- [x] No open issues remain, as defined by the user.
- [ ] The user has explicitly accepted the phase.

**Acceptance record**

| Field           | Value                            |
| --------------- | -------------------------------- |
| Phase status    | Implemented; awaiting acceptance |
| User acceptance | Not accepted                     |

### Phase 8 Confirm React reference completeness and parity

**Start gate:** Phase 7 is complete and the user's explicit acceptance is recorded as **Accepted**.

**Work checklist**

- [ ] Review the accumulated React reference against the full Web parity contract: Home/Page Two content/layout and registrations, controls and URL intent, ordinary XDA sequencing, runtime live preview, consent/state, automatic/manual tracking, sidebar, loading/empty/error/partial-content behavior, retry/reset, and document/BFCache lifetime. Reuse phases 2–7 evidence; inspect again only for defects, relevant changes, or material gaps.

- [ ] Confirm standalone tarball installation, local configuration and credential boundaries, setup/build/lint/typecheck commands, scoped PM2 lifecycle, aggregate setup/CI integration, stylesheet provenance, and the operational README. Complete any remaining documentation and record necessary observable departures. Establishing the app or implementing its planned features is not deferred to this checkpoint.

- [ ] Resolve remaining completeness or integration defects in their owning SDK or app layer. Preserve public API use, shared setup/teardown, and test ownership; add no duplicate runtime logic or tests, MSW, mock services, or E2E tooling. Present the complete reference and its parity results for acceptance before Next implementation begins.

**Completion evidence:** A complete, runnable standalone React reference consumes the packed public React SDK, follows the Web reference's behavior and layout almost exactly, and demonstrates the adapter's intended DX with live content and interactions. Setup/lifecycle/CI integration and its README are usable. Rendering, controls, page/content sequencing, corrected XDA contracts, automatic/manual tracking, sidebar, failure/retry, and ownership have been verified; framework differences are explicit. This phase is independently reviewable and requires user acceptance before proceeding to Next request and router implementation.

**Acceptance checklist**

- [ ] Every work checklist item is complete.
- [ ] The completion evidence above has been verified.
- [ ] No open issues remain, as defined by the user.
- [ ] The user has explicitly accepted the phase.

**Acceptance record**

| Field           | Value        |
| --------------- | ------------ |
| Phase status    | Not started  |
| User acceptance | Not accepted |

### Phase 9 Implement common Next request and handoff utilities

**Start gate:** Phase 8 is complete and the user's explicit acceptance is recorded as **Accepted**.

**Work checklist**

- [ ] Add standalone screen-event parity as a bounded shared SDK API item:
      port the screen builder/submission through Runtime, Node and Web and expose
      React `trackScreen`. Reuse consent, interception, preview suppression, state and
      lifecycle guards. Do not imply native-framework support or expand XDA-carried
      events as part of this addition.

- [ ] Create stable server bindings backed by Node and an explicit request context adapter, adapting the pinned Optimization server/request/handoff helpers to the existing Experiences Node APIs. Read request identity and consent at the host boundary, call `forRequest()` once per request initialization, and memoize that facade for the route's one supported Experience and plan reuse. Keep locale, event context, IP policy, profile, and resolver context request-local. Provide explicit-input utilities that use no framework request reads.

- [ ] Pass the optional preview initializer and Experience/session binding into the Node request facade using phase 2's contract. Ordinary Experience loading uses the bound source without a separate preview fetch API in the application. Reuse runtime snapshot/policy/readiness behavior and serialize only browser-safe initial plans and binding data for takeover, excluding initializer functions, SDK instances, server credentials, and visitor-profile/replay data from preview initialization.

- [ ] Implement actual hybrid transfer through the pinned Next request/runtime/root/provider/Experience family. One Node facade builds supplied page/optional identify arguments once. The actual descriptor content fetch produces the full Node handoff/plan/error result reused by presentation/root even without optional prefetch. Preloading is separate; no descendant inventory or complete-plan barrier applies. SSR uses ordinary Node fetch. Optional explicit browser consumption commits server-supplied replay independently of display; preserve response-bound state/cookies/cache. Reference-only later IDs use ordinary event-free fetch and plan reuse, with no SDK guarantee.

- [ ] Provide safe serialization and a response persistence result/helper gated by `canPersistProfile`. Preserve other response headers/cookies; expire identity when application policy requires it. A cookie's presence never implies consent. Request URL/ownership context forwarded by middleware must be sanitized and overwrite incoming SDK-owned headers; any trusted server-result forwarding requires explicit trusted-boundary configuration.

- [ ] Enforce private response/fetch cache handling for personalized flows and validate public/static policies. Keep diagnostics and nonserializable server values out of browser initialization while preserving server diagnostic access. Parallelize only independent content work; do not optimize away required profile evaluation order.

- [ ] Establish the permanent `implementations/nextjs-sdk` using the Node, Web, and Node + Web reference READMEs, guidance, and source, plus the accepted React APIs and pinned Optimization Next patterns. Reuse the earlier investigation and inspect remaining implementation details. Create its private standalone manifest, local tarball dependencies/overrides, private/public configuration boundaries, credential-free `.env.example`, framework build/start tooling, matching theme/assets, and `implementation-nextjs-sdk` Nx project. Add setup/install/production-build/lint/typecheck and scoped development/PM2 commands, aggregate reference setup, and explicit CI checks outside root workspaces. Start its operational README and app shell once.

- [ ] Add the Next reference’s permanent Home/Page Two server presentation, registrations, slots, Rich Text and repeated plan containers through the shared React renderer. Use one request facade, ordinary Node SSR fetch or the actual hybrid Node transfer producer, comparison-only reference caller loops, plan reuse and optional actual server handoff and private serialization/cache policy. Render independently of submission/replay. Preserve the current reference use cases and conditional event-free preview snapshot flow. Inspect available server behavior with real configured services/installed tarballs; phase 10 supplies router/response/browser takeover without temporary replacements. Extend its README in place.

**Completion evidence:** Colocated Next tests cover request-context mapping, shared initialization, built-batch/profile envelope mapping, response-cookie decisions, cache policy and browser-safe serialization, including profileless data and script escaping. Node/Runtime retain request, profile, consent, handoff and transport coverage. Optional prefetch reuses the page's one supported Experience plan with pinned memoization, without SDK multi-Experience ownership/state/inventory or a whole-plan barrier. Demo reference loops are caller-owned best effort; no SDK cross-fetch guarantee is required. The installed Next reference demonstrates available server rendering independently of committing submission; router/response/browser integration follows in phase 10.

**Acceptance checklist**

- [ ] Every work checklist item is complete.
- [ ] The completion evidence above has been verified.
- [ ] No open issues remain, as defined by the user.
- [ ] The user has explicitly accepted the phase.

**Acceptance record**

| Field           | Value        |
| --------------- | ------------ |
| Phase status    | Not started  |
| User acceptance | Not accepted |

### Phase 10 Implement App Router and Pages Router integrations

**Start gate:** Phase 9 is complete and the user's explicit acceptance is recorded as **Accepted**.

**Work checklist**

- [ ] Add optional React Router and TanStack Router entrypoints in the React
      package, mapping route/location metadata to the existing router-neutral root and
      XDA page-intent ownership. Keep optional router dependencies out of ordinary
      imports; preserve handoff/consent/lifetime behavior without a second page owner.
      Port the pinned router option conventions, adapting its direct page-emitter call
      to ordinary Experiences XDA fetching. This extends the router work explicitly;
      no additional maintained consumer app or live matrix is required.

- [ ] For App Router, add separate server/client binders, request-aware convenience components, and explicit/static components, following the pinned Optimization bound component families and public option conventions. Use request-scoped memoization for the request-aware family. Read `headers()`/`cookies()` only inside that opt-in path. Keep client factories and callbacks in client modules and server resolution/credentials in server modules. SSR-only routes render with Node and the shared server renderer and may attach a managed or injected browser runtime for analytics, consent, identity, and tracking, with state handoff and explicit page ownership but no browser content loading, resolution, or rendering. Every content update uses a server round-trip. Hybrid routes preserve the plan and then attach the managed or injected browser runtime for content rendering as well.

- [ ] Implement middleware/route-handler/Server Action response integration where cookie mutation is supported. Do not write cookies while rendering a Server Component. Ensure the selected middleware implementation is compatible with the actual Next runtime; isolate any Node event work from an Edge-only middleware path. If final profile changes happen after middleware, persist them through a supported response flow rather than claiming middleware captured them.

- [ ] For Pages Router, add `getServerSideProps` request/response utilities, safe props serialization, and one browser owner/coordinator in `_app`. Apply the same SSR-only content-rendering boundary and optional browser analytics contract. Support `getStaticProps`/ISR through explicit static inputs and cache policy. Honor application redirects and errors without fabricating a handoff or page success.

- [ ] Server request helpers and both client adapters use the shared pathname/search normalization rule for the runtime route key and coordinate the first event with hydration. Add a focused unit test showing that equivalent encoded queries produce identical server/browser keys for the initial-page decision and prepared replay. Specify shallow navigation, hash-only changes, query changes, back/forward, redirects, canceled transitions, and route changes during initialization. Retain normal single-route page ownership. Wire both router integrations to shared normal request/root/handoff mechanisms, including consent/error behavior, optional initial-plan prefetch, comparison-only reference caller fetches and existing hydration/replay by one owner. Display remains independent of replay; no multi-profile reconciliation or transaction architecture is required. Do not duplicate the sequence or reintroduce a full-plan preparation barrier in either router.

- [ ] Integrate preview startup and navigation through the same runtime-backed bindings in both routers. Where browser content rendering is enabled, configure the optional initializer in browser runtime setup, adopt serialized initial plan/binding data, and subscribe without a duplicate snapshot request or page event. In SSR-only mode, route preview updates through a server round-trip for snapshot loading and content rendering while preserving the current content until the server result is applied. Apply runtime policy before router startup; do not interpret suppressed preview events as failed visitor initialization. Session changes and exits use the shared SDK source/owner lifecycle. Keep browser configuration safe and never serialize server initializer functions or credentials.

- [ ] Complete the Next reference’s initial document through public request/response helpers and one Node facade. Build initial page/optional URL identify, use ordinary Node fetch for SSR or the Node route-descriptor-only producer for an actual hybrid transfer, use ordinary event-free later-ID comparison fetches, reuse available plans and serialize the actual transfer's full handoff without changing its retained batch/identity/route/locale. Render without JavaScript and independently of replay. The actual hybrid descriptor fetch produces the full result reused by presentation/root without optional prefetch. Browser takeover preserves HTML and supplied plans without startup refetch, hydrates applicable state and performs one matching-route SDK replay/admission decision under CURRENT consent with existing refusal/fallback. Preserve verified independently committed server-page handling, private/no-store policy, supported response-cookie boundaries, early attribution/manual registration, consent mirrors and lifecycle cleanup. Credentials/resolvers stay server-local.

- [ ] Complete the Next reference's Home/Page Two Utilities, controls, tracking/sidebar, and visitor/navigation actions against Node + Web. Preserve one page/content owner and remove old attributed content before reset measurements. Add the existing hybrid reference's runtime-preview startup and subscription flow with deployment-controlled package loading, normal Experience components, usable status/errors, and preserved server content. Prevent competing page owners and speculative prefetch, server re-render or browser takeover from repeating initialization/content/preview work. Document tolerated SSR/CSR preflight noncommit without SDK workaround/current force flag, ordinary browser-local navigation/actions absent a new server handoff, and optional-page replay of an actual server-supplied aggregate, whose batch/ID/route/locale are unchanged by later content responses, comparison-only reference caller loops and one committing owner. Successful XPAPI submission commits under the selected submission identity; browser continuity can supersede the XDA ID, and hydration/admission does not prove finalization of that evaluated ID. Rendering never waits for that success. Integrate the pinned implicit consent-change page exception without explicit retry machinery. Reuse SDK state, queues, measurement, transport, and shared cleanup; add no app-owned preview client or parallel runtime mechanisms.

- [ ] Exercise App Router and Pages Router in `implementations/nextjs-sdk`, keeping the main App Router flow and distinct Pages Router paths with `_app` in one app. Share configuration, registrations, presentation, controls, and lifecycle support where boundaries permit. Build and inspect representative ordinary and preview flows: content with JavaScript enabled/disabled, consent/persistence, cookies/cache/serialization, preserved startup plans, session updates, navigation/event counts, tracking, and error/retry/reset. Include one focused `personalized content → Reset → back/forward` check: restored router content or inputs must not reapply the previous visitor's content, profile, or startup handoff. Reuse existing owner, reset, handoff, and Next navigation behavior; add code only for a demonstrated gap in the selected integration, without introducing a new cache system. Cover the adapter's decision with a simple unit test and inspect the flow directly in the maintained reference. Reuse phase 2's runtime/protocol evidence, update the operational README, and carry results into phase 11. Example migration remains in phase 13.

**Completion evidence:** The installed Next reference builds with both router integrations and contains the planned hybrid presentation, controls, navigation, tracking, and lifecycle behavior. Representative live checks cover initial content without JavaScript, applicable state hydration and matching-route page/replay ownership, response cookies, private caching, and suppression of speculative/duplicate work. Colocated Next tests cover only router-specific decisions; shared React and runtime contracts use their owners' coverage. Supported SSR-only, CSR, committed-page, prepared-replay, browser-owned initial-page, and injected modes do not require another app or a full live matrix for every router/version. Explicit static APIs preserve static rendering and browser bundles exclude server configuration. SSR-only works with or without browser analytics; checks demonstrate no browser content loading, resolution, or rendering, coordinated page ownership, and server round-trips for content updates, including preview. Planned Next reference functionality is implemented before the phase 11 checkpoint.

**Acceptance checklist**

- [ ] Every work checklist item is complete.
- [ ] The completion evidence above has been verified.
- [ ] No open issues remain, as defined by the user.
- [ ] The user has explicitly accepted the phase.

**Acceptance record**

| Field           | Value        |
| --------------- | ------------ |
| Phase status    | Not started  |
| User acceptance | Not accepted |

### Phase 11 Confirm Next.js reference completeness and parity

**Start gate:** Phase 10 is complete and the user's explicit acceptance is recorded as **Accepted**.

**Work checklist**

- [ ] Review the accumulated Next reference against Node + Web parity: content/layout, ordinary request/profile/XDA sequencing, server rendering and applicable state hydration and matching-route page/replay ownership, runtime live-preview snapshots/subscriptions, consent-aware cookies, private caching/serialization, controls/navigation, tracking/sidebar, errors/retry/reset, activation failure, and document/BFCache lifetime, including phase 10's Reset followed by back/forward result. Reuse phase 2 and phases 9–10 evidence; inspect again only for defects, relevant changes, or material gaps.

- [ ] Confirm standalone tarball installation, configuration/credential boundaries, setup/production-build/lint/typecheck commands, scoped PM2 lifecycle, aggregate setup/CI integration, stylesheet provenance, and the operational README. Complete any remaining documentation and record necessary framework departures. Establishing the app or implementing its planned server/browser features is not deferred to this checkpoint.

- [ ] Resolve remaining completeness or integration defects in their owning SDK or app layer. Preserve public API use, shared setup/teardown, and test ownership; add no second runtime, duplicate suites, MSW, mock services, or E2E tooling. Present the complete reference and its parity results for acceptance before integrated verification begins.

**Completion evidence:** A complete standalone Next.js reference consumes the packed public Next.js SDK and matches the Node + Web hybrid reference almost exactly in content/layout and observable request/browser behavior. Server rendering without JavaScript, applicable state hydration and matching-route page/replay ownership, response cookies, one event/content owner, controls, corrected XDA contracts, real automatic/manual tracking, sidebar, failures, and cleanup have been verified. Setup/lifecycle/CI integration and its README are usable. This phase has its own acceptance before integrated verification begins.

**Acceptance checklist**

- [ ] Every work checklist item is complete.
- [ ] The completion evidence above has been verified.
- [ ] No open issues remain, as defined by the user.
- [ ] The user has explicitly accepted the phase.

**Acceptance record**

| Field           | Value        |
| --------------- | ------------ |
| Phase status    | Not started  |
| User acceptance | Not accepted |

### Phase 12 Verify integration against corrected XDA

**Start gate:** Phase 11 is complete and the user's explicit acceptance is recorded as **Accepted**.

**Work checklist**

- [ ] Review owning-package tests, packaging checks, maintained app builds, and live observations from phase 2 and the downstream implementation phases. Repeat checks only for relevant changes, failures, or material gaps. Confirm that runtime live preview and corrected ordinary XDA contracts compose correctly across rendering, requests, hydration, routing, consent, refresh, and teardown. This phase adds no consumers, duplicate suites, or deferred feature implementation.

- [ ] Confirm the standalone React-to-Web and Next.js-to-Node+Web parity results from phases 8 and 11. Reuse their installed-artifact and live-flow evidence for layout, direct visits/back-forward, controls, consent, automatic/manual tracking, sidebar, error/retry/reset, JavaScript-disabled content, and event counts. Inspect again where subsequent integration changes affect those results. Record material departures and validation gaps without creating simulated services, E2E tests, or test infrastructure.

- [ ] Verify supported initial built XDA events, selected content, one actual-intent submission, ordinary response/profile handling and CURRENT consent/refusal/fallback through existing owners. Content displays independently of submission; Retry creates no events/replay. Inspect retained reference loops only as best-effort demo caller behavior, without cross-fetch proof. Preserve source maps/authentication, transport limits and the implicit consent-change page exception.

- [ ] Use existing owning-package coverage and representative live observations for the corrected XDA contract and integrated preview source. Inspect relevant transport/initialization failures, consent or preview suppression, ordinary offline admission, partial content, content Retry, session changes and navigation/reset races where changed logic or real conditions warrant it. HTTP 200 is insufficient proof of personalization success. Report limitations and actual outcomes; do not manufacture cases, add refactor-specific regression tests, duplicate coverage or require every failure state to occur live. Valid content is not a profile-required visitor-initialization failure. Frozen preview limitations remain unchanged; forced preflight explains a provisional-ID profile-only lookup 404; the title 422 remains separate and unresolved.

- [ ] Reconcile phase-6 correction evidence and active API/reference guidance: initial built events in XDA, selected plans independent of replay, best-effort caller loops for retained demo use cases, one exact-batch commit owner, CURRENT prepared gating/fallback and pinned implicit page retry on consent changes. Ensure no old direct-identify/page prerequisite, `content-cycle.ts`, per-descriptor identify, mandatory descriptor inventory, loader `pageResult` or whole-plan/commit/identity display barrier returns. The owning packages maintain production/README/AGENTS consistency and corrected local validation.

**Completion evidence:** Combined owner/artifact/reference evidence verifies the corrected XDA fetching and exact-batch submission flow, comparison-only reference caller loops, replay-independent display, ordinary refresh/Retry without new initial events and the pinned consent-change page exception. Consent, queues, lifecycle, private-cache, rendering and frozen Preview guarantees remain intact. Actual full built-event acceptance, selection and counts are recorded with the title 422 limitation kept visible. These are completion requirements; this documentation correction does not establish live results.

**Acceptance checklist**

- [ ] Every work checklist item is complete.
- [ ] The completion evidence above has been verified.
- [ ] No open issues remain, as defined by the user.
- [ ] The user has explicitly accepted the phase.

**Acceptance record**

| Field           | Value        |
| --------------- | ------------ |
| Phase status    | Not started  |
| User acceptance | Not accepted |

### Phase 13 Migrate examples documentation and release artifacts

**Start gate:** Phase 12 is complete and the user's explicit acceptance is recorded as **Accepted**.

**Work checklist**

- [ ] Migrate `examples/nextjs` and add the planned managed CSR React example using the completed reference APIs. Update `app/[slug]/page.tsx`, `app/layout.tsx`, `components/ConsentPanel.tsx`, preview composition, configuration, and registry boundaries. Preserve parameters, personalization, consent, registries, empty-plan behavior, and deliberate errors; an empty Experience is not automatically a 404. Replace the example's independent preview-client path with the optional runtime initializer and ordinary Experience rendering, preserving initial content and updates. Address migration-related integration defects; unrelated example issues remain separate. Document both routers from the Next reference without another consumer or duplicate validation routes. Add necessary example build targets. Do not modify other framework adapters, examples, or their shared bootstrap scripts in this phase; phase 6's narrow XDA-contract cleanup exception does not expand the later framework integration scope.

- [ ] Update SDK/React/Next.js and reference documentation in their READMEs, root README, and AGENTS guidance; leave Live Preview package documentation unchanged. Finalize the five references' operational/parity notes and setup guidance. Cover changed renderers, imports, registries, plan props, fetching, and preview hooks/exports. Document conditional loading of existing preview exports, ordinary SDK usage and production exclusion; link to Runtime's canonical preview limits. Explain managed/injected ownership, cookies, static routes, refresh, raw transport bypass, and initial-event responsibility. Link to [XDA preflight and profile finalization](../packages/runtime/README.md#xda-preflight-and-profile-finalization); describe initial built events in XDA, ordinary event-free fetch for later comparison IDs and same-ID Retry, optional explicit replay of the actual server-supplied envelope with retained continuation identity and one browser owner, replay-independent display and the pinned implicit page retry on consent changes. Document the single temporary default Web page-context omission and restored ordinary Web content and the raw caller-context backend limit; preserve caller-owned events/providers/arguments and Node/Client fields. Hydration/storage/cookies/readiness do not finalize profiles. Leave other framework documentation/examples and shared example bootstrap scripts unchanged.

- [ ] Reconcile the preview-shortcoming notes in Runtime, Node, Web, React and Next READMEs with the observed integrations. Document any unavoidable initial SSR-only refresh as best-effort behavior and preserve evidence-backed follow-up capabilities for the preview maintainers. Upstream preview deficiencies do not gate completion; SDK-owned policy, cleanup and loop-prevention defects still do.

- [ ] Validate the compatibility/breaking-version strategy under Nx's independent release configuration and lockfile updates. Confirm the new package's release baseline before integration: AGENTS requires a tag preceding its introduction, while also mentioning first-release handling; verify the actual chosen workflow in a dry run rather than treating those as interchangeable steps. Any tag push, publication, or deployment requires a separately authorized release action.

**Completion evidence:** React/Next.js examples build and their ordinary and runtime-backed preview flows are usable. The three existing references and two new framework references consume the public artifacts with documented optional preview setup. Relevant owner checks pass, the migration guide covers changed public surfaces, and release dry runs include compatible versions and the new package. Other framework adapters/examples remain untouched by this phase; phase 6's narrow contract cleanup is accounted for separately. Runtime live preview and the phase 6 XDA cleanup are part of this workstream's acceptance; forced preflight, exact-batch replay, comparison-only reference caller loops and replay-independent display remain documented.

**Acceptance checklist**

- [ ] Every work checklist item is complete.
- [ ] The completion evidence above has been verified.
- [ ] No open issues remain, as defined by the user.
- [ ] The user has explicitly accepted the phase.

**Acceptance record**

| Field           | Value        |
| --------------- | ------------ |
| Phase status    | Not started  |
| User acceptance | Not accepted |

## Sequential phase gates

| Phase | Workstream                                              | Required start gate                                          |
| ----- | ------------------------------------------------------- | ------------------------------------------------------------ |
| 1     | Existing designs, reuse map, API and DX contracts       | No preceding phase                                           |
| 2     | Runtime live preview and existing reference integration | Phase 1 complete and accepted                                |
| 3     | Packages and React reference foundation                 | Phase 2 complete and accepted                                |
| 4     | Attributed rendering and React reference presentation   | Phase 3 complete and accepted                                |
| 5     | React ownership/hooks and reference controls            | Phase 4 complete and accepted                                |
| 6     | XDA workaround cleanup                                  | Phase 5 complete and accepted                                |
| 7     | React loading/coordination and reference completion     | Current Phase 6 correction complete and accepted (satisfied) |
| 8     | React reference completeness and parity checkpoint      | Phase 7 complete and accepted                                |
| 9     | Next common utilities and server reference integration  | Phase 8 complete and accepted                                |
| 10    | App/Pages integration and Next reference completion     | Phase 9 complete and accepted                                |
| 11    | Next.js reference completeness and parity checkpoint    | Phase 10 complete and accepted                               |
| 12    | Integration verification against corrected XDA          | Phase 11 complete and accepted                               |
| 13    | Documentation, example migration, and release artifacts | Phase 12 complete and accepted                               |

Parallel work is permitted only within the active phase. Keep any parallel ownership disjoint: renderer work in existing rendering modules; lifecycle/hooks/loading in new React integration modules; common request utilities, App Router, and Pages Router in distinct Next modules. Reference increments may proceed alongside their SDK implementation once the required public contracts are available within that phase. Give shared reference configuration, presentation, and lifecycle files one owner; App Router and Pages Router work may run in parallel in phase 10 only with disjoint files. Runtime capability changes need one owner because they affect shared state and transport contracts. Integrate shared declarations and export maps sequentially. Technical independence does not waive a preceding phase's completion and acceptance gate.

## Validation and acceptance coverage

Use the existing Vitest, typecheck, build, and packaging infrastructure. For the current Phase 6 corrections, delete tests asserting rejected behavior and add focused maintained no-network unit/contract tests and run proportional existing checks. Future phases add focused tests only for genuinely new uncovered owner logic. Use maintained example/reference builds and representative live flows for integration confidence. No additional runnable consumer, exhaustive validation matrix, or separate per-case evidence registry is required. Unit tests use simple test doubles and make no network calls. MSW, mock services, service simulations, E2E tests/tooling, and changes to `lib/mocks` remain excluded under the testing scope above.

### Test ownership and colocation

Every unit test belongs to the source module whose logic it exercises and to the package that completely owns that logic. Keep `<module>.test.ts(x)` beside `<module>.ts(x)`. A large module may use adjacent `<module>.<concern>.test.ts(x)` files only for distinct concerns without overlapping assertions. Use `<module>.ssr.test.ts(x)` for SSR-specific behavior; a second environment or import path does not justify copying a test.

| Owner           | Logic tested only by that owner                                                                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core            | Payload/plan resolution, design/token resolution, and attribution construction/encoding.                                                                                          |
| Design          | CSS-property and design utility logic implemented in Design.                                                                                                                      |
| Client          | Delivery requests, XDA serialization and normalization, payload conversion, and Client errors.                                                                                    |
| Runtime         | SDK-side preview module contract/wrapper and shared orchestration, event construction, consent policy, handoff validation, and Runtime-owned transport/queue logic.               |
| Node            | Request-facade state, request-bound inputs and preview initialization, snapshot integration, profile policy, and Node handoff production.                                         |
| Web             | Browser state/persistence, shared preview signal/source, thin binding and fetch/resolution lifetime/publication, singleton, handoff/page coordination, and interaction detection. |
| Live Preview    | Existing snapshot/protocol, parsing, reconnection, and editor-status behavior; the package and its tests are frozen and run unchanged.                                            |
| React           | React rendering/root bindings, providers, hooks, action binding, and React-owned loader/presentation and route coordination.                                                      |
| Next.js         | Next request/response adaptation, cookie/cache/serialization decisions, integration envelopes, and router-specific coordination.                                                  |
| Packaging tools | Archive and installation helper logic, tested beside the scripts that implement it.                                                                                               |

Inspect the owner's existing coverage before adding or porting tests. For future new logic, extend the existing owned case or add a distinct one; never copy assertions into a caller, adapter, re-exporting package, example, or reference. Adapter tests cover their own mapping, ordering, ownership, and presentation decisions; they do not retest dependency algorithms or policies. If logic moves, move its tests with it and remove the duplicate from the former owner. Consolidate duplicate coverage encountered in the changed area while preserving unique assertions. A test whose concern has no complete owner signals a responsibility to resolve in the implementation, not permission for overlapping suites. Review test changes against these ownership rules before completing each phase.

The Live Preview package freeze takes precedence over test relocation or consolidation: leave its implementation and tests untouched. New SDK integration tests exercise only the wrapper's own decisions against the public contract; existing protocol coverage remains in its owner.

### Shared setup and teardown

Use one reusable implementation for repeated test setup and teardown. Reuse package-local support within its owning package; common environment support used across packages belongs in one dependency-neutral workspace helper, not copied files or imports of another package's private fixtures. Share only the repeated lifecycle operations, keeping case inputs and assertions local. Each helper owns creation and cleanup together and exposes an explicit disposer or uses the existing test lifecycle. Cleanup restores the resources it changed, including React roots, subscriptions, runtime instances, timers, browser state, and globals, and runs on failures. Keep resource creation explicit rather than relying on module-import side effects. Use simple unit-test doubles where needed; do not add a new test framework, MSW, mock services, E2E tooling, or production test hooks to achieve reuse.

Runtime and application setup/teardown follow the same ownership rule: React/Next entrypoints delegate to their shared owner, and reference lifecycle commands reuse the maintained installation/process tooling. Avoid copying lifecycle implementations between routers, suites, or apps.

### Proportional verification

Package checks establish owned logic, exports, declarations, and dependency boundaries. Phase 2 exercises runtime preview in the three existing references. Each downstream SDK phase builds and inspects its permanent reference increment for rendering, navigation, content refresh/recovery, preview, consent, cookies, and tracking as those capabilities become available. Later-phase features are not prerequisites for an earlier increment. Reuse runtime/protocol evidence instead of duplicating it in framework packages. Reference builds exercise installed tarballs without separate consumers; example migration checks follow in phase 13.

Choose additional failure, race, and offline checks when changed logic or material risk warrants them. Report actual observations and material limitations without claiming unobserved behavior passed. Reuse relevant results across phases; rerun or broaden checks only after relevant changes, failures, or unresolved concerns. A missing observation does not authorize more infrastructure or a duplicate test suite. The user's open-issue and explicit-acceptance rules remain in force.

| Accepted proposal commitment            | Required demonstration                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime-backed framework integration    | Actions, consent, queues, retry, interceptors, reset, and teardown retain runtime semantics                                                                                                                                                                                                                                                                                                                                                                                 |
| Optional runtime live preview           | One lazy opt-in and ordinary Experience calls; Node snapshots, Web subscriptions, preserved hybrid startup, runtime policy/lifetime, and production exclusion demonstrated in phase 2 and reused downstream                                                                                                                                                                                                                                                                 |
| Frozen preview package                  | SDK-side integration uses existing public exports only; package source/exports/build/tests/docs stay unchanged, and unsupported transport or error capabilities are not advertised                                                                                                                                                                                                                                                                                          |
| Managed React path                      | Bound registry, one browser owner, loading/error/retry, state hooks, safely destructured actions                                                                                                                                                                                                                                                                                                                                                                            |
| Composable and low-level paths          | Supplied plans, injected SDK, custom loader/cache, presentation callbacks, direct runtime access, supported node composition                                                                                                                                                                                                                                                                                                                                                |
| SSR-only                                | Server owns all content rendering and updates; optional browser analytics/state handoff preserves content without browser loading, resolution, or rendering; page ownership is coordinated                                                                                                                                                                                                                                                                                  |
| Hybrid                                  | Initial plan and HTML are preserved; applicable state is adopted; one matching initial-page decision and correct later navigation                                                                                                                                                                                                                                                                                                                                           |
| Request and cache isolation             | Concurrent visitors remain isolated; private state cannot enter public/static caches; explicit APIs preserve static rendering                                                                                                                                                                                                                                                                                                                                               |
| Standard tracking                       | Container/node attribution, layout-sensitive roots, repeated/multi-root plans, manual controls, dynamic opt-ins, actual interaction events                                                                                                                                                                                                                                                                                                                                  |
| Content refresh                         | Ordinary refresh adds no page; Retry uses ordinary same-ID event-free fetch, without new event hooks/publication/admission/commit or a page/profile recovery loop; normal root joining and genuine evaluated-identity dependencies remain; stale content results cannot commit                                                                                                                                                                                              |
| Non-Next.js host composition            | React-owned tests and maintained React apps cover supplied plans, injected runtimes, explicit lifecycle inputs, and independent contexts without Next dependencies                                                                                                                                                                                                                                                                                                          |
| Separate React and Next packages        | React works without Next; server/client entry graphs and declarations enforce dependency boundaries                                                                                                                                                                                                                                                                                                                                                                         |
| Lifecycle safeguards                    | Strict Mode, failed setup, remounts, navigation during initialization, reset, consent withdrawal, and late responses                                                                                                                                                                                                                                                                                                                                                        |
| Standalone reference parity             | Three existing references gain preview in phase 2; React grows in phases 3–5 and 7, with phase 6 cleanup before managed loading; Next grows in phases 9–10; both match ordinary/preview behavior and confirm completeness/parity in phases 8 and 11                                                                                                                                                                                                                         |
| Corrected XDA compatibility             | Phase 6 corrects Node/Web/hybrid; Phase 6 also completes current optional React consent/lifecycle consumption; phase 7 implements managed React loading/navigation/reference integration; phases 9–10 implement Next. Phase 12 verifies ordinary SSR/CSR fetch, actual hybrid transfer with/without optional prefetch, event-free later comparison IDs/same-ID Retry, and explicit incoming replay ownership independent of display; no reconciliation/barrier architecture |
| Breaking migration                      | Runnable old-to-new recipes, clean installs, correct package versions, complete exported API mapping                                                                                                                                                                                                                                                                                                                                                                        |
| Explicitly instructed stack publication | Local phase completion requires no commit, push, or PR. Only when explicitly instructed by the user, preserve separate phase PRs in one stack and the coordinated merge constraints above. Agents must not suggest or solicit these actions.                                                                                                                                                                                                                                |

Run scoped Nx build/test/lint/typecheck targets for affected owners as phases land. Before completion, run the applicable root `npm run build`, `npm test`, `npm run lint`, `npm run typecheck`, and formatting checks once against the final changes, plus maintained example/reference production builds not included by root targets. Prepare or refresh affected references through their existing setup workflow and inspect representative live behavior. Reuse passing evidence unless later changes or failures justify another run. Do not create consumers, duplicate suites, MSW, mock services, service simulations, or E2E jobs/tooling to satisfy validation. Keep unit tests free of network calls and use ordinary test doubles where needed. Report material failures attributable to excluded infrastructure. Live checks use the corrected XDA contract after phase 6 cleanup. Use successful committing XPAPI response plus a profile-only lookup of the actual submission identity as commitment/finalization evidence; do not claim same-profile XDA finalization when browser continuity selected another identity. XDA preview, admission and hydration alone are insufficient. Preserve generic committing-XPAPI retry ambiguity; only the documented default Web-context workaround is authorized; no separate workaround workflow or frozen-preview fix is assumed.

## Active phase 6 contract

The [cleanup plan](./react-next-runtime-xda-cleanup-plan.md) defines the current Node-transfer-only producer, ordinary SSR/CSR fetch and optional explicit incoming replay. Current implementation, checks and acceptance review are recorded in the Phase 6 validation section. Phase 6 is complete and explicitly accepted on 2026-11-02; Phase 7 is implemented and awaiting user acceptance. Earlier Phase 6 checks and service observations remain historical.

## Implementation progression

Phases 1–5 remain complete and accepted. Phase 6's historical accepted/published head is `5db2ea217617`; the reviewed revision at `b2720d8` is complete and explicitly accepted on 2026-11-02. Phase 7 baseline, approved refinements and refactoring are validated; user acceptance remains pending; phases 8–13 remain not started. Future React uses ordinary Web fetch with optional explicit server handoff consumption; Next actual hybrid descriptor fetch reuses its full result without requiring optional prefetch. Preserve maintained use cases, frozen Preview and Git/scope policy.

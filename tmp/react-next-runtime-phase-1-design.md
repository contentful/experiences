# React and Next.js runtime integration phase 1 design

**Status:** Phase 1 accepted; phases 1–5 remain complete and accepted. Phase 6's historical acceptance/publication at `5db2ea217617` is preserved in the [implementation plan](./react-next-runtime-implementation-plan.md). Phase 6 is complete and explicitly accepted on 2026-11-02; current checks and acceptance review are recorded in the implementation plan. Earlier checks/review remain historical. Phase 7 is implemented and awaiting user acceptance; its Phase 6 gate is satisfied. Active changes below document the accepted correction.

> **Current loading contract:** SSR uses ordinary Node fetch, CSR/local navigation uses ordinary Web fetch, and only actual hybrid transfers use Node producer → optional explicit browser consumer. Normal fetch needs no handoff. See [Runtime XDA contract](../packages/runtime/README.md#xda-preflight-and-profile-finalization); Phase 6 is verified, complete and explicitly accepted on 2026-11-02.

The implementation plan governs scope where the earlier [proposal](/Users/charles.hudson/Projects/contentful/experiences/tmp/react-next-runtime-proposal.md) differs: runtime live preview is included, the Live Preview package is frozen, other framework integrations remain outside this work, and phase 6 corrects initial event-bearing XDA loading in the existing Node/Web/hybrid references and current optional React consent/lifecycle consumption before phase 7 implements managed React loading/navigation. This design uses the existing Runtime, Node, Web, Core, and React owners and adds framework composition around them. The cleanup plan's [stage-owner reuse constraint](./react-next-runtime-xda-cleanup-plan.md#initial-content-and-exact-submission) governs consolidation with removal of Node aggregate commit, Web producer and content-reuse branches/helpers.

## Evidence and compatibility baseline

**Prior correction validation (root-reported local results before consolidation):** Ordered SDK builds passed for Client, Runtime, Node and Web. Existing affected-owner suites for Client, Runtime, Node and Web passed in eight Nx tasks, including Web SSR. Companion-reuse verification comes from source review and the temporary contract probe below, rather than newly added maintained test cases. Owner typecheck/lint passed in nine tasks. Final setup for all three existing references passed in twenty tasks; reference lint/typecheck passed in six tasks. SDK artifacts were packed and installed in the temporary validation checkout. Independent review reported no unresolved findings. The latest installed-reference lint/typecheck recheck passed in six tasks, and the latest React compatibility test/typecheck/lint checks passed in eighteen tasks after type narrowing. These results apply to the prior correction snapshot and do not validate the consolidation. Those prior consolidation checks are historical and do not validate this remedy; fresh correctness/design review and explicit acceptance remain pending. User acceptance remains pending and Phase 7 is not started; no new live-service result or CI pass is claimed. See the [Phase 6 current validation record](./react-next-runtime-implementation-plan.md#phase-6-remove-obsolete-xda-workarounds); historical acceptance remains preserved.

**Prior temporary companion-reuse contract probe (root-reported before consolidation):** An inline executable probe with mocked raw transport and no network used `node:util.isDeepStrictEqual` and canonical JSON comparisons. It recorded `hooks=2`, `evaluations=2`, `reuseDeepEqual=true`, `commitDeepEqual=true`, `reuseWireEqual=true`, `commitWireEqual=true`, `sameEnvelope=true`, `accepted=true`, and `preflight=false`. Plain `JSON.stringify` differed only in property order; the deep and canonical wire comparisons confirm preservation. Together with source review, this verifies finalized-event reuse, original-envelope retention and admission to the mocked committing call. No new maintained test files/cases or code were added; this probe is not a live-service result.

Optimization parity now uses committed source at `f76f1ff04df1b466c98fc6ce5db6b569f9212438` from open [PR #549, `restore/runtime-preview-after-release`](https://github.com/contentful/optimization/pull/549), not main or the adjacent working tree. Earlier phases used `59add9d6ebff503b9033a59a2eee0149d4b4e925`; that pin is historical evidence only and is superseded for this correction. Read source with `git -C /Users/charles.hudson/Projects/contentful/optimization show f76f1ff04df1b466c98fc6ce5db6b569f9212438:<path>`.

**Current correction contract (verified; Phase 6 complete and accepted):** Ordinary SSR uses
Node fetch; CSR and browser-local navigation/actions use ordinary Web fetch.
Existing type-tagged builder arguments or raw built events remain supported, with
SDK-owned construction once. Only actual server-to-browser transfers retain Node
`fetchExperienceForHandoff(options, resolveOptions, { routeKey })`, returning a
full handoff plus optional plan/error. The producer captures raw final Client
events/query arrays unchanged without server replay-compatibility validation before
XDA; normal SDK builder XPAPI and Client XDA validation suffice. Manually built/raw
transmission remains consumer-owned risk. The existing wire event union covers raw
Client and normal SDK events without a new DTO or safety layer. Receiving replay
validation/admission remains, with available content usable on refusal. Optional Web/React consumption is mode agnostic
and explicitly consumer supplied; normal fetch needs no handoff. Actual Node
producer event hooks run sequentially like Optimization preparation; ordinary
Node/Web fetch chains remain concurrent with ordered results.

XDA always invokes XPAPI preflight without committing. SSR/CSR XDA events remain
uncommitted as a tolerated service bug awaiting upstream force-commit support.
There is no current force flag or SDK workaround. Remove Node aggregate commitment,
the Web handoff producer and all handoff-as-content re-evaluation union branches/
helpers. Direct event APIs remain callable, not prerequisites or compensation.

Ordinary SSR/CSR noncommit is tolerated absent observed blocking errors; it
requires no synthetic XPAPI replay or commit-success prerequisite. Future XDA
`preflight: false` support is outside current implementation, while actual hybrid
transfers retain existing browser replay. See the clarified
[current contract](./react-next-runtime-implementation-plan.md#current-implementation-and-boundaries);
Insights acceptance of provisional IDs remains an expectation, not a verified guarantee.

Same-ID content Retry and later reference comparison IDs use ordinary event-free
fetch without builders, event hooks, publication, admission or replay. Incoming
accepted replay delivery retry remains queue-owned. Official support is one
Experience per page, unenforced; reference loops provide no multi-Experience or
cross-fetch guarantee. Page Two CUSTOM TRACK is nonpage intent; navigation still
carries a page. See [Runtime XDA contract](../packages/runtime/README.md#xda-preflight-and-profile-finalization) for canonical details and retained replay rules.

Browser handoff identity is captured before hydration in this order: current live profile, configured anonymous provider, then `handoff.profileId`. Ordinary request identity remains provider-first. The XDA-returned ID is paired with the finalized batch as continuation fallback; live browser continuity may supersede that ID. Exact event-message preservation does not guarantee commit evaluation/selection or same-profile finalization under a different live identity. Hydration, queue admission and local identity adoption do not establish commit success.

**Retained aggregate ownership (verified; Phase 6 complete and accepted):** See the [concrete source/departure and planned owner-evidence map](./react-next-runtime-xda-cleanup-plan.md#remedy-departures-and-planned-owner-evidence).

Use Web's accepted-route tracker for replay or gated fallback only for page-bearing refused replay or explicit page intent; add no `initialPageEvent` emit/skip API, hook-owned first-route skip or post-terminal mark-accepted rule. Refused page work remains eligible through existing consent-reactive invocation; blocked nonpage events are dropped. Ordinary offline capacity refusal precedes publication and never evicts accepted work. Capacity refusal remains retry-eligible while the complete operation returns `{ accepted: false }`. If an eligible page fallback is accepted, the current initialization is complete and the original refused replay batch is not resubmitted; accepted replay is never replaced by fallback on HTTP failure. Keep one stable root across replay/nonreplay navigation. Matching replay supersedes a pending initial callback, and late callback completion cannot emit a competing page. Preserve preview, reset, consent-withdrawal, owner replacement and teardown safeguards.

Remove the standalone XPAPI `prepareRequestHandoff` mechanism, separate `createRequestHandoffFromData` producers and public `hydrateHandoffState` workflow. Node `fetchExperienceForHandoff` remains the producer only for actual server-to-browser transfers; necessary state application stays internal to its complete consumption operation. React provider/root expose optional, mode-agnostic, explicitly consumer-supplied `handoff?: ExperiencesHandoff`, replacing `initialization: { routeKey, handoff }` and `ExperiencesStateInitialization`. Within its existing effect, current optional React consumption observes `sdk.states.consent` and reinvokes the complete operation using the current browser route and one stable `isCurrent` lifetime guard forwarded into SDK state application/admission. Coalesced SDK work remains live while any joined caller is live; cleanup unsubscribes without destroying an injected SDK or cancelling accepted queue delivery. Basic optional consumption and the existing implicit page consent path must complete in Phase 6, with no dedicated facility or mode detector. This necessary API migration does not pull managed loading or other Phase 7 capabilities forward. Preserve accepted phases 1–5 and their historical evidence; record this correction as complete and explicitly accepted on 2026-11-02.

**Correction validation boundary:** Remove tests asserting rejected behavior and add focused maintained unit/contract tests at the owning layer, using local functions, spies and deferred promises without network calls. Cover identify/track-only and optional-final-page ordering/schema/limits, full aggregate ownership and React prop/export migration, replay-less state application and explicit page intent, page-only route deduplication and gated refusal, current consent/restamping/preview, content failure retaining usable replay, ordinary event-free same-ID Retry without repeated hooks/events/commit, and reset/destroy/supersession/late-response guards. Preserve cache/scope and existing queue/transport limits. No network tests, MSW, E2E, mock/server simulation infrastructure, dependency upgrades or frozen Live Preview edits. Earlier checks/review, including the 1008- and 1,011-test results, are historical and do not validate this revision. Current implementation, checks and review are recorded in the Phase 6 validation section. Phase 6 is complete and explicitly accepted on 2026-11-02; Phase 7 is not started and its acceptance gate is satisfied. Keep changes unstaged; no commit, push or PR change is authorized.

Experiences was inspected at `b57c2dc86aeca6e834ad7d5da3618d4ddbf7c4f9`. The plan's `fab4f47cfd2da0ad6b761d577b71fdb01f8d41a7` is an ancestor; intervening changes are example bootstrap, the Astro example, and release metadata. Preserve those changes. Active Optimization evidence is pinned to `f76f1ff04df1b466c98fc6ce5db6b569f9212438` from PR #549; references below mean that committed revision, not main or its working tree.

The existing Next example allows Next `^15.0.0` and React `^19.0.0`; its lockfile resolves Next `15.5.25`. Select Next `^15.5.0` and React/React DOM `^19.0.0` for the new Next package, with Next 15.5.25 as the representative implementation build. Keep React's existing `^18.0.0 || ^19.0.0` peer range. This establishes a deliberate support floor without committing to Next 16 or Edge execution. The shared preview source replaces the unaccepted phase-2 Web resource APIs; other Runtime/Node/Web public changes remain additive. React preview exports and explicit entrypoint migration are the accepted breaking changes; shared APIs used by other adapters retain their behavior.

### Existing source and reuse map

| Capability                                                      | Existing source                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Treatment and reason                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request facade, event context, profile replacement and consent  | [Node runtime](../packages/node/src/contentful-experiences.ts), [Node handoff producer](../packages/node/src/handoff.ts)                                                                                                                                                                                                                                                                                                                                                                                          | Direct use. One facade per request; preserve ordinary fetch/profile/consent and handoff semantics. Demo caller loops remain best effort.                                                                                                                                                                                                              |
| Transport configuration and explicit registry per resolve/fetch | [Runtime](../packages/runtime/src/contentful-experiences.ts), [Delivery client construction](../packages/runtime/src/create-runtime-delivery-client.ts)                                                                                                                                                                                                                                                                                                                                                           | Direct use. Keep stable clients/configuration in Runtime and varying state in the leaves.                                                                                                                                                                                                                                                             |
| XDA embedded event conversion and source maps                   | [Client fetching](../packages/client/src/fetch-experience.ts), [personalization serialization](../packages/client/src/personalization.ts)                                                                                                                                                                                                                                                                                                                                                                         | Direct use. Frameworks request attribution with `extensions.sourceMap`; Client alone serializes XDA events.                                                                                                                                                                                                                                           |
| Event outcome                                                   | [EventEmissionResult](../packages/runtime/src/event-emission-result.ts), [direct event methods](../packages/runtime/src/runtime-event-methods.ts)                                                                                                                                                                                                                                                                                                                                                                 | Direct use. `accepted` is admission; only returned evaluation data establishes evaluated identity for the current operation.                                                                                                                                                                                                                          |
| Browser hydration, prepared admission and page attempts         | [Web runtime](../packages/web/src/contentful-experiences.ts), [current-page coverage](../packages/web/src/contentful-experiences.current-page.test.ts)                                                                                                                                                                                                                                                                                                                                                            | Direct use with framework ordering. Do not add another event queue or treat state-only hydration as a tracked route.                                                                                                                                                                                                                                  |
| Handoff validation and cache metadata                           | [Runtime handoff](../packages/runtime/src/experiences-handoff.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Direct use. HTTP response/fetch cache enforcement and the framework envelope are additional Next responsibilities.                                                                                                                                                                                                                                    |
| Next request adaptation and cookies                             | Optimization [server.tsx](https://github.com/contentful/optimization/blob/f76f1ff04df1b466c98fc6ce5db6b569f9212438/packages/web/frameworks/nextjs-sdk/src/server.tsx), [cookies.ts](https://github.com/contentful/optimization/blob/f76f1ff04df1b466c98fc6ce5db6b569f9212438/packages/web/frameworks/nextjs-sdk/src/cookies.ts), [pages-router-server.ts](https://github.com/contentful/optimization/blob/f76f1ff04df1b466c98fc6ce5db6b569f9212438/packages/web/frameworks/nextjs-sdk/src/pages-router-server.ts) | Port option grouping, cookie readers, response preservation and explicit request inputs. Preserve the middleware/page-time versus browser-hydration boundaries. Pages/explicit response owners can persist after content evaluation. Do not port consent-to-startup-default conversion, which conflicts with this plan's established defaults policy. |
| App Router request family                                       | Optimization [app-router-request-runtime.tsx](https://github.com/contentful/optimization/blob/f76f1ff04df1b466c98fc6ce5db6b569f9212438/packages/web/frameworks/nextjs-sdk/src/app-router-request-runtime.tsx), [app-router-request-handoff.ts](https://github.com/contentful/optimization/blob/f76f1ff04df1b466c98fc6ce5db6b569f9212438/packages/web/frameworks/nextjs-sdk/src/app-router-request-handoff.ts)                                                                                                     | Adapt request memoization and server/client boundaries. Capture applicable state/supported built batch through supported request ownership; optional prefetch is not an all-content readiness barrier, and descendant render order is not an ordering guarantee.                                                                                      |
| Request context forwarding                                      | Optimization [request-handler.ts](https://github.com/contentful/optimization/blob/f76f1ff04df1b466c98fc6ce5db6b569f9212438/packages/web/frameworks/nextjs-sdk/src/request-handler.ts), [request-handler.test.ts](https://github.com/contentful/optimization/blob/f76f1ff04df1b466c98fc6ce5db6b569f9212438/packages/web/frameworks/nextjs-sdk/src/request-handler.test.ts)                                                                                                                                         | Adapt sanitization, trusted opt-in and preservation of existing responses. Its compact page/profile envelope is not a transport for render plans or proof of final post-XDA identity.                                                                                                                                                                 |

Source links and names identify reuse, not new dependencies. Port compatible source with existing license notices; no customer dependency on the Optimization checkout is introduced.

| Retained abstraction                   | Optimization implementation and required adaptation                                                                                                                                                                                                                                                                                                                | Disposition                                                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry factory and browser ownership | React `provider/OptimizationProvider.tsx`, Web `presentation/optimizationRootRuntime.ts`. Port owned/injected binding and cleanup. The factory captures the registry needed for XDA resolution/rendering; it does not construct a new ownership framework.                                                                                                         | Retain `createReactExperiences`, managed roots, injected providers and explicit shared bindings.                                                     |
| Shared preview source and presentation | Universal Core `OptimizedEntrySourceController.ts`; Web `presentation/OptimizedEntryController.ts`, `OptimizedEntrySnapshot.ts`, `OptimizedEntryLoadingPresentation.ts`; React `optimized-entry/useOptimizedEntry.ts`. Adapt selection/subscription/presentation to asynchronous XDA plans and Preview Session payloads instead of locally resolving CDA variants. | Use one SDK preview source and thin binding; port existing source/presentation controllers for framework state, without a second resource framework. |
| Shared page/content initialization     | React `root/OptimizationRoot.tsx` (`OptimizationPageSequence`), `auto-page/useAutoPageEmitter.ts`, Web `trackCurrentPage`. Actual server Node production retains finalized replay before XDA; optional browser consumption is explicit, while ordinary SSR/CSR fetch needs no handoff.                                                                             | Retain normal route ownership, one-Experience loading and ordinary plan reuse; demo loops remain outside the SDK.                                    |
| Optional plan prefetch                 | Next `app-router-request-runtime.tsx` and `app-router-server.tsx` managed-entry prefetch. Reuse the page's one supported initial Experience plan with applicable handoff capture; reference-only later comparison IDs use ordinary event-free fetch.                                                                                                               | Retain optional `prefetchExperiences`; no complete descriptor inventory, `prepareExperiences` family or whole-plan readiness barrier.                |
| Integration envelope                   | Next/Web `handoff.ts` hydration and optional-page replay and page-bearing-only fallback responsibility. Add route association and separately carried XDA plans; runtime handoff validation must admit identify/track-only intent with an optional single final page.                                                                                               | Retain route/render-policy association and Web replay/fallback ownership; remove emit/skip metadata.                                                 |
| Component-root bindings                | Web `presentation/OptimizedEntryTrackingAttributes.ts` and existing Experiences `ExperienceNode`/Core attribution. XDA introduces nested nodes, named slots and multiple node roots, rather than a single baseline entry.                                                                                                                                          | Retain container/node attribution and manual-root binding.                                                                                           |
| Lazy preview initializer and wrapper   | Optimization `packages/web/preview-panel/{package.json,rslib.config.ts,README.md}` for optional loading only; Experiences `live-preview` public snapshot/client/status exports for the content protocol.                                                                                                                                                           | Retain the structural wrapper; no bridge or protocol port.                                                                                           |

The approved shared preview source, registry/owner, integration envelope, attribution and lazy module contracts remain. Corrected request/event loading removes obsolete ordering/eligibility/preparation barriers without changing their unrelated purposes. Use the smallest necessary CDA/XDA adaptation; retain existing Experiences lifetime corrections and the frozen preview package boundary.

## Public entries and migration

Use explicit entries, following Optimization's package boundaries. Preserve React's ESM/unbundled build and per-file client directives. Node remains ESM; Runtime/Web retain their current dual formats and Web UMD. Next is ESM and depends on React and Node. No Next peer or dependency enters React.

| Package entry                                              | Public surface                                                                                                                                                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| React `.` and `/server`                                    | Server renderer, registry/type helpers, pure design/attribution utilities, current free Client/Core functions and EventBuilder exports. No live Web or optional Preview imports.                                                           |
| React `/client`                                            | `createReactExperiences`, `ExperiencesRoot`, `ExperiencesProvider`, `Experience`, `useManagedExperience`, client/supplied-plan renderer, existing render-context hooks, state hooks including preview, bound actions, `useExperiencePlan`. |
| React `/host`                                              | Ports of `createExperiencesRootSdkBinding` and `disposeExperiencesRootSdkBinding`, binding types, explicit route/presentation inputs. Providers can attach to the same existing SDK in independent roots.                                  |
| React `/web-sdk`                                           | Public Web constructor and direct Web types/operations, including shared preview and optional initializer types.                                                                                                                           |
| React `/custom-renderer`                                   | Preserve `resolveNodeProps`, `NodeSnapshot`, `ResolvedNode`, `ExperienceNode`, `ExperienceNodeProps`, `createExperienceNode`; extend root bindings in place.                                                                               |
| Next `.`                                                   | Empty runtime entry, as in Optimization; require an explicit documented subpath.                                                                                                                                                           |
| Next `/app-router/server`, `/app-router/client`            | `bindNextjsAppRouterServerExperiences` and `bindNextjsAppRouterClientExperiences`, respective types and bound component families.                                                                                                          |
| Next `/pages-router`, `/pages-router/server`               | Browser binding for `_app`; separate `getServerSideProps` request/response binding.                                                                                                                                                        |
| Next `/server`, `/request-handler`                         | Explicit Node request/preparation/persistence utilities; sanitized middleware context handler. Neither is a browser entry.                                                                                                                 |
| Next `/client`, `/custom-renderer`, `/tracking-attributes` | Appropriate public React and Core re-exports so Next customers install one top-level package.                                                                                                                                              |
| Both `/package.json`                                       | Manifest access.                                                                                                                                                                                                                           |

`ExperienceRenderer` continues to alias `ClientExperienceRenderer` on the client entry, with the current `experience` prop. `ServerExperienceRenderer` retains that prop too; do not rename it to `plan`. Root imports of client APIs move to `/client`. All current registry types and definition/normalization helpers, render fallback components/types, `useExperience`, component/template/design hooks, Core payload/plan/resolver types, design helpers, free fetch/client/host/error/parameter/sitemap exports, `EventBuilder`/argument types and `ANONYMOUS_ID_COOKIE` remain available on the appropriate entry. `useExperience` still means the singular render context; `useExperiences` means the runtime. `useExperiencePlan` retains its supplied-payload behavior on `/client`.

The breaking preview migration replaces React's `useLivePreview`, `useLivePreviewExperience` and their option/result types with runtime configuration, `fetchExperience` and the thin `subscribeToPreview` binding. React's Preview Session function/error/client/session-type re-exports move to direct imports from the unchanged optional package. `PREVIEW_WEBSOCKET_HOST` remains obtainable there. The current standalone hooks remain unchanged until their scheduled migration. After migration, no compatibility path may recreate independently owned preview clients. Phase 3 changes exports/dependencies; phase 5 forwards runtime configuration and phase 7 replaces hook usage and phase 13 migrates the Next example. Document each import change and the preserved supplied-plan escape hatch.

## Optional runtime preview and shared source

The wrapper consumes only the existing public module. These declarations describe the approved SDK contract; the source migration and validation are complete. They do not import the optional package:

```ts
type RuntimePreviewStatus = 'live' | 'static';
interface RuntimePreviewClient {
  getResult(): { readonly data: ExperiencePayload | undefined; readonly error: Error | undefined };
  subscribe(listener: () => void): () => void;
  subscribeStatus(listener: (status: RuntimePreviewStatus) => void): () => void;
}
interface RuntimePreviewSessionIdentity {
  spaceId: string;
  environmentId: string;
  sessionId: string;
  resourceResolution?: string;
}
interface RuntimeLivePreviewModule {
  fetchPreviewSession(
    session: RuntimePreviewSessionIdentity,
    client: { previewToken: string; host?: string },
    resolve: FetchResolveOptions
  ): Promise<PortableRenderPlan>;
  createLivePreviewClient(
    session: RuntimePreviewSessionIdentity & {
      previewToken: string;
      sessionHost?: string;
      debug?: boolean;
    },
    initialPayload?: ExperiencePayload
  ): RuntimePreviewClient;
  sendPreviewStatus(status: RuntimePreviewStatus): void;
}
interface RuntimeLivePreviewBinding {
  experienceId: string;
  sessionId: string;
  resourceResolution?: string;
  sessionHost?: string;
  implementation: RuntimeLivePreviewModule;
}
type RuntimeLivePreviewInitializer = () =>
  RuntimeLivePreviewBinding | Promise<RuntimeLivePreviewBinding>;
```

Add `livePreview?: RuntimeLivePreviewInitializer` to Node's request context and Web's configuration. Runtime owns structural types and stateless mapping; it stores no session/request/browser state. Initializer presence establishes immutable preview policy synchronously. Combining it with explicit `isPreview: false` is invalid. Lazy initialization runs once per leaf lifetime outside rendering; all affected operations join it. Failure remains observable and never enables ordinary event-bearing fallback. Node replacement uses a new facade; Web replacement of a binding remains within preview policy. Entering or leaving preview recreates Web, preserving its existing fixed-policy contract.

One initializer binds one Experience ID/session per owner. A matching by-ID call uses the session; other IDs retain their ordinary Delivery/CPA source but remain under the runtime's preview event policy. Destination methods keep their current source semantics. Await initialization before deciding an ID is unrelated. Managed rendering requests `extensions.sourceMap` on the ordinary source branch, including manual/attribute-only tracking. Source selection precedes both this managed default and Web's existing automatic-tracking enrichment in `fetchExperience`; the session branch never receives SDK-added ordinary extensions. Unsupported caller overrides still reject. Supplied plans and session payloads use their available attribution without an extra fetch; missing session attribution renders safely without fabricated tracking data. This avoids separately synchronized application preview flags.

Map the runtime's scope, `preview.accessToken`, effective HTTP `preview.host`/generated endpoint default, and binding `resourceResolution` into the snapshot arguments. Require a nonempty token; do not silently use Delivery credentials. Evaluate supported token/endpoint suppliers before each HTTP operation or new subscription client. `sessionHost` is an explicit WebSocket endpoint, not an HTTP URL conversion. Merge resolve defaults in existing order: Runtime → request → operation, with shallow metadata merging and operation-local registry. Resolver context comes from `metadata`; no parallel `context` option is added.

The wrapper forwards only the public package's supported options; transport limits stay in Runtime's canonical [preview reference](../packages/runtime/README.md#optional-runtime-live-preview). Session locale/parameters remain server-owned: reject explicit per-call locale/parameters/extensions for the matching session; implicit runtime locale does not change it. Preview policy drops caller personalization through the existing gate. The snapshot helper returns only a resolved plan: adopt it once without fabricating raw payload state.

Web owns one Preview Session source/connection and publishes it through the ordinary SDK signal/observable machinery:

```ts
interface PreviewState {
  readonly experienceId?: string;
  readonly sessionId?: string;
  readonly data: ExperiencePayload | undefined;
  readonly error: Error | undefined;
  readonly status: RuntimePreviewStatus | undefined;
  readonly revision: number;
}
interface States {
  readonly preview: Observable<PreviewState | undefined>;
  // Existing seven states retain their types and behavior.
}
interface PreviewUpdate {
  readonly data?: PortableRenderPlan;
  readonly error?: Error;
}
interface PreviewOperations {
  readonly states: States;
  subscribeToPreview(
    experienceId: string,
    resolve: FetchResolveOptions,
    listener: (result: PreviewUpdate) => void
  ): Subscription;
  replaceLivePreview(initializer: RuntimeLivePreviewInitializer): Promise<void>;
}
```

`states.preview` is undefined during initialization or when integration is disabled and carries raw subscription payloads, reported errors and connection status otherwise. Content revisions advance on new payloads; status-only changes do not advance revision or resolve again. Use the existing immediate `subscribe` and `{ unsubscribe() }` convention, through the existing `toObservable` adapter; published raw payload references are read-only. Remove `observeExperience`, `observeExperienceChanges`, `ExperienceContentResource`, `ExperienceContentState` and `ContentObservable`; no per-resource SDK state or alternate observable remains. Snapshot runtimes add an inert undefined preview observable; their other seven states and commands retain their behavior.

`fetchExperience` remains the explicit initial/refresh operation. A matching bound ID uses the session snapshot helper and adopts its already-resolved plan. `subscribeToPreview` is only a binding to the shared source: filter the Experience ID, resolve a newly available raw payload with effective operation-local options, and emit `PreviewUpdate` with optional `data` and `error`, which may coexist when a new plan carries an existing source error. Status is exposed only through `states.preview`. It never fetches a snapshot or owns loading, retained plan, diagnostics, retry or per-view state. A binding can resolve the source's current payload when attached; status-only notifications do not repeat that resolution. Unsubscribe detaches the listener and prevents its obsolete completions from publishing; source/connection lifetime belongs to the SDK, independent of an individual view. SDK setup and replacement coordinate its public package data/status subscriptions and `sendPreviewStatus`.

Share equivalent event-free in-flight fetches and resolution within the existing owner/source generation, registry and visitor scope, following Optimization normalized keys and pending-promise mechanics. Skip opaque inputs and keep no completed cross-visitor cache. Event-bearing fetches stay ordinary independent operations; reference caller code handles any comparison-only reference loop. No SDK chaining state is introduced.

Each SDK operation captures source, lifetime, identity and consent revisions before work and checks them before profile/result publication. Its own evaluated profile update must not invalidate its content result. Effective source/identity changes, event-consent withdrawal, reset and destruction invalidate obsolete work without implicitly fetching again; persistence-only changes with unchanged identity and browser locale changes irrelevant to a session do not. A newer socket payload supersedes an older pending snapshot/resolution result; suppress obsolete completions without claiming HTTP cancellation. Personalization `personalizationRequestState` keeps its existing meaning.

Framework/view presentation retains its supplied or fetched plan and existing loading/error/diagnostic state. Empty plans are successful; ordinary partial content still renders. Preview resolution diagnostics/errors preserve the last usable presentation, following the existing hook. A server `initialPlan` seeds only that presentation and needs no startup snapshot; it is not raw preview data. The caller asserts descriptor/binding provenance, with Next validating it in the envelope. The frozen helper cannot populate raw preview state from a snapshot plan.

Node adds `request.destroy(): void` to invalidate unfinished request work without destroying the shared SDK; it owns no socket. Web uses its existing reset/consent/destroy guards and retains fixed preview policy. `replaceLivePreview` is allowed only on a preview instance and invalidates/unsubscribes the old source before initializing the next. Exiting preview requires recreation. Explicit consent/reset and persistence semantics remain intact.

SSR-only adapters subscribe directly to `states.preview` and use matching content revision changes to request a server round-trip. They never call the resolving binding or resolve/render browser payloads. Preserve the server subtree until replacement and keep the SDK connection stable across refreshes. The frozen protocol cannot distinguish its first payload from an edit; a possible initial refresh is best effort, not a new protocol or completion gate. Runtime's canonical [preview limits](../packages/runtime/README.md#optional-runtime-live-preview) remain unchanged; consumer docs link there.

```ts
const livePreview: RuntimeLivePreviewInitializer | undefined =
  previewEnabled && sessionId
    ? async () => ({
        experienceId,
        sessionId,
        implementation: await import('@contentful/experiences-live-preview'),
      })
    : undefined;

const request = nodeSdk.forRequest({ ...requestContext, livePreview });
try {
  const plan = await request.fetchExperience({ experienceId }, { config: serverRegistry });
  renderOnServer(plan);
} finally {
  request.destroy();
}

const sdk = new ContentfulExperiences({ ...browserConfig, livePreview });
// Preserve an application-supplied initialPlan; otherwise fetch once.
if (initialPlan) renderPlan(initialPlan);
else renderPlan(await sdk.fetchExperience({ experienceId }, { config: browserRegistry }));
const subscription = sdk.subscribeToPreview(
  experienceId,
  { config: browserRegistry },
  ({ data, error }) => {
    if (data) renderPlan(data);
    showError(error);
  }
);
// Host teardown calls subscription.unsubscribe(), then destroys its owned SDK.
```

Optional deployment follows Optimization's separate-package pattern. SDK declarations use only the structural interface; no required dependency, eager import, `typeof import` or re-export may resolve Live Preview. Consumers supply native dynamic `import()` from ESM or CJS code; do not require the frozen ESM-only package from CJS. Web UMD consumers load a separately served browser ESM bundle prepared from installed artifacts in the maintained references. Unbundled package files alone leave bare imports unresolved. A compile-time deployment flag must eliminate the preview chunk from the disabled production build; a runtime flag only prevents loading. Keep all frozen package source/build/tests/docs unchanged.

## React binding rendering and lifetime

### Approved API refinement addendum (2026-11-02)

The Phase 7 refinement checklist in the implementation plan extends the original
React API examples below: committed resolution/error notifications, a typed live
SDK discriminator, node/function fallbacks, an authoritative supplied-plan source
on `Experience`, and `initialPagePayload` shorthand with builder precedence.
Existing full-state render callbacks, pure renderers, registry binding and runtime
policy remain supported. The original signatures below record the accepted
baseline; implementation declarations and the refinement checklist govern the
extended forms. Cleanup follows implementation and preserves those semantics.
The minimal managed `initialError?: Error` seed also records an application-owned
failed snapshot without a duplicate startup fetch. It can accompany `initialPlan`,
keeps preview binding active, and permits explicit event-free Retry/refresh or a
genuine descriptor change to recover. It is never a transport field or reapplied
solely because an unchanged seeded view renders again. Supplied mode excludes it.

Phase 9 also adds standalone screen-event API parity across shared/public SDKs.
Phase 10 adds optional React Router/TanStack bindings while retaining the existing
Next router work. Neither introduces client-side variant selection, XDA screen
input support, a new page tracker, a resource framework or native support.

Port Optimization's provider, root binding, state-hook and action-hook mechanics. `createReactExperiences` is the registry-bound facade over them; it is pure and safe at module scope. The bound managed root owns Web, while the injected provider owns only its subscriptions. A shared host binding exposes the same `sdk`, `ownsInstance` and optional cleanup shape as Optimization's `optimizationRootRuntime.ts`. No new singleton, global owner registry or application event queue is needed.

```ts
interface CreateReactExperiencesOptions {
  config: Config;
}
// Remedy target: provider/root consume the full handoff; no separate initialization DTO.
type ExperiencesRootProps = React.PropsWithChildren<
  Config & {
    snapshot?: ExperiencesSnapshot;
    handoff?: ExperiencesHandoff;
    routeKey?: string;
    buildPagePayload?: CurrentPageOptions['buildPayload'];
    onStatesReady?: (states: States) => void | (() => void);
  }
>;
type ExperiencesProviderProps = React.PropsWithChildren<{
  sdk: ContentfulExperiences;
  snapshot?: ExperiencesSnapshot;
  handoff?: ExperiencesHandoff;
  onStatesReady?: (states: States) => void | (() => void);
}>;
// Framework request descriptor; not a Web resource API.
type PersonalizationRequestOptions = FetchExperienceOptions;
interface ManagedExperienceProps extends PersonalizationRequestOptions, ExperienceTrackingOptions {
  onNodeRoot?: OnExperienceNodeRoot;
  initialPlan?: PortableRenderPlan;
  resolveOptions?: Omit<FetchResolveOptions, 'config'>;
  loadingFallback?: React.ReactNode;
  errorFallback?: (result: ManagedExperienceResult) => React.ReactNode;
  children?: (result: ManagedExperienceResult) => React.ReactNode;
}
interface ManagedExperienceResult {
  readonly status: 'idle' | 'loading' | 'success' | 'error';
  readonly data: PortableRenderPlan | undefined;
  readonly error: Error | undefined;
  refresh(): Promise<void>;
  retry(): Promise<void>;
}
declare function createReactExperiences(options: CreateReactExperiencesOptions): {
  ExperiencesRoot: React.ComponentType<ExperiencesRootProps>;
  ExperiencesProvider: React.ComponentType<ExperiencesProviderProps>;
  Experience: React.ComponentType<ManagedExperienceProps>;
  ExperienceRenderer: React.ComponentType<Omit<ClientExperienceRendererProps, 'config'>>;
  useManagedExperience(props: ManagedExperienceProps): ManagedExperienceResult;
};
```

Unbound rendering retains explicit `config`; bound rendering supplies that registry. `PersonalizationRequestOptions = FetchExperienceOptions`, inherited by `ManagedExperienceProps`, accepts customer-supplied existing builder arguments or raw built XDA events through `personalization.events`; no separate identify prop or root event-input DSL is needed. Phase 7 reuses compatible pinned Optimization root/controller options and adapts XDA inputs in the owning loader after inspecting the actual port. `buildPagePayload` returns page builder arguments, not a direct `sdk.page` call. Normal tracking retains one route-page owner; `beforeInitialPage`, if retained, stays optional for standalone purposes and never gates content. Selected content and activation/presentation readiness do not wait for commit/identity success. The supplied-plan renderer triggers no fetch/resolve; keep server-only resolvers/functions out of browser registries and serialization.

The root constructs Web in a commit effect, using the ported binding helper. Initial SSR/browser rendering reads one stable `createWebSnapshotRuntime` snapshot and the same supplied plan. Expose `useExperiencesContext()` with `{ sdk, error, isLive, isContentReady }` under the activation/barrier contract below; content loading state remains in the framework/view presentation. A failed setup keeps the snapshot/content and exposes its error. Injected SDK replacement rebinds subscriptions; structural configuration changes require deliberate root replacement. Locale changes use `setLocale` rather than reconstruction.

Follow Optimization's cleanup ownership, retaining Experiences' existing late-response and failed-construction safeguards. Ensure cleanup exceptions cannot prevent owned SDK destruction. Strict Mode setup/cleanup replay cannot leave the first owned SDK alive while constructing a second; an abandoned setup releases its binding, and its continuation cannot update a replacement. Independent roots use injected providers over the same SDK/binding; provider unmount never destroys it. The host disposes the binding once at final teardown. State subscriptions are attached before owner-driven hydration/page work where the reference sidebar must observe startup attempts; this ordering is an explicit existing plan requirement. Snapshot/handoff data never become Web `defaults`.

The implemented phase-5 context hook `useExperiences()` follows Optimization’s `useOptimization()` for direct runtime access; implemented `useExperiencesContext()` exposes readiness/error details. Their `WebExperiencesRuntime` types support cached snapshot-to-live and injected-runtime replacement without a consumer-owned SDK lifecycle. Phase 7 adds managed loading/root integration, not another runtime-access hook framework.

Port the cached-emission `useSyncExternalStore` hook and keep the server snapshot cached too, because Web clones `.current`. Support immediate emissions, replacement, cleanup and nullish/false values. The existing seven hooks are `useProfileState`, `useLocaleState`, `useConsentState`, `usePersistenceConsentState`, `usePersonalizationRequestState`, `useEventStreamState`, and `useBlockedEventStreamState`; add `usePreviewState` for the shared source; each returns exactly the corresponding `States[K]['current']` type. Reading a last event as state is not a new event attempt; callback subscriptions must not re-emit historical attempts as fresh events.

`useExperiencesActions` ports Optimization's names and receiver-safe memoization: `setConsent`, `flushEvents`, `identifyUser`, `trackPageView`, `resetUser`, and `trackEvent`, plus `setLocale` and the existing Experiences `trackView`, `trackClick`, `trackHover`, `trackFlagView`. Each returns the underlying method's result and preserves its error/consent/interceptor behavior. `trackPageView` stays a manual direct action. `identifyUser` does not implicitly refresh content. Component actions do not expose ownership destruction.

<a id="phase-56-boundary-and-observable-readiness"></a>

### Phase 5/7 boundary and observable readiness

Use Optimization at `f76f1ff04df1b466c98fc6ce5db6b569f9212438` as the behavioral example: `OptimizationProvider` selects an initial snapshot or injected runtime and publishes activation/error state; `OptimizationPageSequence` in `OptimizationRoot.tsx` releases its ready barrier after the initial page attempt settles, including rejection. The Experiences context carries that terminal-barrier behavior through its implemented `isContentReady` field. Root readiness remains a lifecycle signal; XDA-selected content is presented independently of event submission/replay success.

The accepted Phase 5 baseline owns `createReactExperiences`' root/provider and bound **supplied-plan** renderer, runtime/context/state/action hooks, owned/injected/shared lifetime, optional preview initializer forwarding and `states.preview` observation. It does not port a view-specific content controller, bind resolved preview plans to a view, migrate the retained legacy preview hooks, fetch initial content, or emit/replay route pages. Managed presentation/binding operations remain Phase 7. The necessary Phase 6 remedy migrates the existing provider/root to `handoff?: ExperiencesHandoff` and complete consumption using current browser route, replacing separate `initialization`/`ExperiencesStateInitialization`; this boundary correction does not implement managed loaders. The Phase 5 reference continues its supported application-owned free-fetch path and displays supplied plans; an optional session source can be initialized/observed with ordinary provider state without claiming a live-update content view is complete. Phase 7 adds the managed `Experience`/request-controller port, descriptor-scoped `subscribeToPreview` binding, retained convenience-hook migration where still needed, and the route/content sequence. No temporary preview hook/controller or separately constructed preview client bridges the phase gate.

The fields have distinct meanings:

- `sdk`: the current **presentation runtime**, typed as the existing `WebExperiencesRuntime`. Inside a provider it is the cached snapshot or the activated live SDK; it is never a promise or an unavailable placeholder. `useExperiences()` outside a provider throws a missing-provider error, following `useOptimization`. Retaining the snapshot after activation failure is the accepted Experiences correction needed to preserve usable supplied content; the pinned provider can instead unset its runtime on failure.
- `isLive`: true only while context is backed by the current concrete Web SDK binding; false for snapshot fallback. It describes runtime activation, not socket status, payload availability or identity evaluation. An injected runtime is still live even though the provider does not own it.
- `isContentReady`: whether the **current local root/route initialization decision is terminal or no barrier remains**, not whether content was fetched successfully. It is false only while required activation/local initialization work is pending; a pending submit/replay does not hold it false or prevent selected-plan display. Phase 5 has no managed route-page coordinator. The necessary Phase 6 consumer-boundary remedy replaces separate state-only initialization with complete `handoff` consumption using the current browser route, without making transport completion a barrier. Phase 7 preserves terminal route ownership/readiness without using replay, commit or identity success as a display gate. A matching verified independent server commitment remains non-emitting through the existing route owner; no emit/skip API is added. Selected content stays usable across event refusal, failure or offline admission.
- `error`: the current owner's activation/binding or required state-hydration error, exposed alongside its retained runtime/content. Clear it only when that setup succeeds again or a new owner/injected binding supersedes it. Preview initialization/connection errors stay in `states.preview.error`; view fetching/resolution errors stay in `ManagedExperienceResult.error`. Phase 7 reports route submission/refusal errors through their owner without replacing successfully selected content with an initialization error. Do not reinterpret `personalizationRequestState` or every preview notification as a global provider failure.

| Situation                                                                                               | `sdk` / `isLive`                                                                          | `isContentReady`                                                                           | Error and presentation behavior                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SSR and first hydrating render of a managed root, or injected provider with a supplied snapshot/handoff | Same cached snapshot / false                                                              | false until required activation/setup settles                                              | No new error; preserve the supplied plan and stable server/browser HTML. The supplied-plan renderer never hides or fetches content because this flag is false.                                                                                                                                                                     |
| Client-only injected runtime with no snapshot/handoff or other deferred setup                           | Existing SDK / true, following the pinned provider's immediate injected-runtime path      | true when no initialization barrier is required                                            | No construction/destruction by the provider; `onStatesReady` and subscriptions still attach after commit before root-owned hydration/page work.                                                                                                                                                                                    |
| Binding active; required internal state application still pending                                       | Live SDK / true                                                                           | false                                                                                      | Preserve supplied content and attach state observers before applying initialization.                                                                                                                                                                                                                                               |
| Phase 5 setup settles successfully, with no route coordinator                                           | Live SDK / true                                                                           | true                                                                                       | Clear that owner's setup error; actions/state/manual root registration use the live runtime. The accepted Phase 5 baseline introduced no automatic page/fetch/replay. The accepted Phase 6 remedy consumes an explicitly supplied full aggregate; it never invents page intent or introduces managed fetching.                     |
| Construction/binding fails, including a throwing `onStatesReady`                                        | Cached snapshot / false after releasing an owned failed binding                           | true once the failed attempt is terminal                                                   | Expose the setup error, preserve content and prevent late activation; never destroy an injected SDK. A deliberate retry/remount/replacement may start another setup attempt.                                                                                                                                                       |
| Required internal state application fails on an otherwise valid live binding                            | Live SDK / true                                                                           | true once terminal                                                                         | Retain that live binding and supplied content, expose the hydration error; no handoff/page success is invented.                                                                                                                                                                                                                    |
| Lazy preview initializer is pending, fails, or succeeds before any socket payload                       | Current SDK / true after activation                                                       | Unchanged by preview transport/source state                                                | The SDK establishes preview suppression synchronously and makes ordinary matching fetches join its lazy initialization. Observe undefined/error/status through `states.preview`; no fallback to event-bearing ordinary mode, no waiting for first socket data, and no duplicate startup snapshot fetch merely to settle readiness. |
| Explicit/static preview without a session source                                                        | Current SDK / true after activation                                                       | true after root setup; no ordinary page/identity barrier                                   | Preview policy still applies; undefined preview state is valid and must not leave the root permanently pending.                                                                                                                                                                                                                    |
| Preview session replacement within fixed preview mode, reconnect or status/error-only update            | Same SDK / true                                                                           | Unchanged                                                                                  | SDK owns source replacement/invalidation; preserve the view's last valid plan. Source errors remain observable. Session replacement is not a new route/page decision.                                                                                                                                                              |
| Phase 7 ordinary activation/navigation or explicit initialization recovery                              | Current SDK / true                                                                        | false during required local setup/decision; replay completion is not a readiness condition | Matching verified independent server commitment remains non-emitting through the existing route owner. Submission success, refusal, rejection and offline admission retain truthful outcomes; a selected XDA plan displays independently of them. Fetch/publication still obeys current owner lifetime.                            |
| Injected SDK/managed owner replacement, abandoned setup or final disposal                               | Rebind the new runtime or release the departing binding; never publish from the old owner | Recompute only for the current owner's barrier                                             | Cleanup old subscriptions/root registrations, clear only superseded setup errors, and guard late work. Hydrating a new binding uses its matching snapshot; client-only immediate injection may stay live.                                                                                                                          |

The retained differences are bounded by the Experience contract. Snapshot retention after failed provider setup preserves supplied content without claiming a live SDK. XDA evaluates built initial page/identify with content, returns a plan/profile ID and forces noncommitting preflight; supported built-batch submission/replay has one owner with that returned ID as continuation fallback and does not gate display. Demo loops exist only for rendering-scenario comparison, not supported product usage. No page-first eligibility or page-specific Retry recovery is required. Preview status stays SDK source state; no second queue, owner registry, cache or protocol is introduced.

`states.preview === undefined` means disabled **or** initializing; the hook preserves that SDK value. Do not use it, `status === 'live'`, the first payload, or `personalizationRequestState: success` as a root-readiness predicate. SDK initialization, socket/stream status and per-view loading are separate existing concerns. Preview-mode page refusal is suppression, not a failed visitor-initialization prerequisite. The initial/refresh `fetchExperience` operation and the resolving binding keep their Phase 2 guarantees; Phase 7 view presentation handles their pending/error outcomes independently of the root barrier.

Acceptance tests remain with the owners. Phase 5 covers cached SSR/hydration snapshots, activation success/failure and retained content, client-only injected access, asynchronous internal state application within complete aggregate consumption, observer ordering, SDK replacement/manual-ref cleanup, optional preview-state pending/failure/static mode and unchanged root flags on replacement/status updates. Phase 7 covers view-specific binding/disposal, no snapshot fetch from the binding, initial-plan preservation while updates resolve, preview initialization failure through the managed error path, and ordinary route/submission terminality for success/refusal/rejection/offline admission, exact-batch mapping and display independent of replay/commit/identity success. Use ordinary doubles/deferred promises in owning tests; rely on existing Runtime/Web transport and lifecycle coverage.

The attributed renderer extends the existing traversal and `ExperienceNode`, preserving registration namespaces, slots, design context, unknown/error fallback and `defaults < design < content < resolved < slots` precedence. Add one default Experience container (`div`, with semantic `as` or a supplied root binding) and Core's plan attribution. Missing attribution creates an empty attribution boundary so the tree cannot borrow an ancestor plan's attribution. Avoid per-component wrappers.

Registered single-root components forward ordinary HTML attributes and React refs by default (`forwardRef` for React 18 compatibility). Keep presentation components portable; integration wrappers may adapt SDK metadata when required. An optional registration `root: { prop: 'experienceRoot' }` supplies `getRootProps(rootKey?, props?)` for fragments/multiple roots and explicit ref composition. Use distinct stable keys for actual roots. Text-only roots, discarded props and portals outside the container cannot be automatically attributed; portals need their own valid boundary. Repeated containers remain distinct presentations; roots within a container retain shared scope grouping. Preserve customer refs/attributes. Use one container customization surface, `as`, with ordinary `rootProps`; a custom component forwards attributes/ref to its actual root. The separate `renderRoot` callback is removed.

Renderer controls port Optimization's `clickable`, `trackViews`, `trackHovers`, and `trackClicks`. Undefined leaves existing attributes/Web defaults in control; false disables that automatic kind, and true opts it in, subject to consent. Apply these attributes to node roots through the existing traversal, preserving source-map scopes and the plan boundary even when all kinds are disabled. There is no public automatic/manual/none enum. Explicit registration remains the Web SDK's `enableElement`/`clearElement` operation; a manual-view presentation disables the automatic kinds it intends to replace. Client `onNodeRoot({ element, node, attribution, data }) => cleanup` is the low-level root seam. `data` is the SDK-selected innermost rooted scope, ready for element registration; it is undefined when attribution is missing or that node roots no scope. Applications must not synthesize it or duplicate selection logic. Web measures each manual registration independently; do not invent manual multi-root interval aggregation. Rendering and presentation invalidation detach obsolete attribution before reset can measure it under a new visitor, including direct SDK reset paths.

This user-authorized DX revision replaces the earlier tracking enum and overlapping container callback. Its reference default uses ordinary single-root forwarding; named bindings remain an optional advanced path. Remove the development root-count collector and readiness panel from normal reference UI. SDK ownership/context improvements remain in Phase 5 and managed content/route orchestration in Phase 7; API alignment alone does not implement those phases.

**Consumer DX acceptance:** Phase 5 must make runtime access and lifetime follow Optimization's provider/root/context pattern: the normal manual example obtains `sdk` through `useExperiences()` rather than threaded props, binds its registry once, uses normalized `data`, and returns SDK cleanup through the existing root/ref binding. No consumer root map, attribution traversal, observer, or effect/cleanup framework is required. Callback replacement when the snapshot becomes live or the injected SDK changes must clean up old registration and attach the current SDK. Explicit application-owned/injected integration remains a supported escape hatch. Document the remaining manual registration lines honestly; do not present them as XDA workarounds or promise zero manual lifecycle work.

Phase 7 must carry those per-kind and optional root callback props through the bound managed `Experience`, making ordinary rendering require an ID and one root/registry binding, with framework-owned fetch/loading/retry/preview and route initialization. The reference demonstrates both automatic and manual views through that same surface. Package type/DX checks and the maintained reference verify the concise managed and context-based manual examples. The XDA adaptation belongs to ordinary event construction/content fetching and actual server-to-browser replay; ordinary consumer root/ref components keep the concise rendering contract.

### Typed React usage

Optional `handoff?: ExperiencesHandoff` remains explicitly consumer supplied and mode agnostic; normal fetch needs none. Current Phase 6 implementation, checks and signatures are verified; acceptance is recorded in the implementation plan. Preserve application-owned typed registries, browser configuration and plans; owning phases validate implemented signatures.

The managed/context-based manual example below is an acceptance target for Phases 5 and 7. It uses the same bound `Experience` component as automatic rendering. Package DX/type checks and the maintained reference must exercise this shape; no runnable consumer is created for this document:

```tsx
const { ExperiencesRoot, Experience } = createReactExperiences({ config: browserRegistry });

function ManualExperience({ experienceId }: { experienceId: string }) {
  const sdk = useExperiences();
  const registerView = useCallback<OnExperienceNodeRoot>(
    ({ element, data }) => {
      if (!data) return;
      sdk.tracking.enableElement('views', element, { data });
      return () => sdk.tracking.clearElement('views', element);
    },
    [sdk]
  );

  return <Experience experienceId={experienceId} trackViews={false} onNodeRoot={registerView} />;
}

// The root owns SDK setup, readiness, route initialization and final cleanup.
<ExperiencesRoot {...browserConfig} routeKey={routeKey}>
  <Experience experienceId="home" />
  {/* Alternatively replace this with <ManualExperience experienceId="home" />. */}
</ExperiencesRoot>;
```

The registry and browser configuration are application inputs. Only the selected
manual interaction is disabled automatically; clicks/hovers retain their normal
policy. Explicit registration/cleanup remains visible, following Optimization's
manual pattern. This does not require SDK props, consumer scope selection, a root
collector, or a separate loading orchestration component. Phase 5 exercises the
same callback through `ExperienceRenderer experience={suppliedPlan}` before
Phase 7 supplies managed loading.

```tsx
'use client';
import { createReactExperiences } from '@contentful/experiences-react/client';
const { ExperiencesRoot, ExperiencesProvider, Experience, ExperienceRenderer } =
  createReactExperiences({ config: browserRegistry });

function ManagedPage({ routeKey }: { routeKey: string }) {
  return (
    <ExperiencesRoot
      {...browserConfig}
      routeKey={routeKey}
      buildPagePayload={() => ({ properties: { path: routeKey } })}
    >
      <Experience experienceId="home" loadingFallback={<p>Loading…</p>} />
    </ExperiencesRoot>
  );
}

function AppLoadedPage({ sdk, plan }: { sdk: ContentfulExperiences; plan: PortableRenderPlan }) {
  return (
    <ExperiencesProvider sdk={sdk}>
      <ExperienceRenderer experience={plan} />
    </ExperiencesProvider>
  );
}
```

```tsx
import {
  createExperiencesRootSdkBinding,
  disposeExperiencesRootSdkBinding,
} from '@contentful/experiences-react/host';

// Application browser activation, outside React render; sdk is application-owned.
const binding = createExperiencesRootSdkBinding({ sdk });
{
  const { ExperiencesProvider, ExperienceRenderer } = firstUi;
  firstRoot.render(
    <ExperiencesProvider sdk={binding.sdk}>
      <ExperienceRenderer experience={firstPlan} />
    </ExperiencesProvider>
  );
}
{
  const { ExperiencesProvider, ExperienceRenderer } = secondUi;
  secondRoot.render(
    <ExperiencesProvider sdk={binding.sdk}>
      <ExperienceRenderer experience={secondPlan} />
    </ExperiencesProvider>
  );
}
// One host owns route activation; neither provider creates a competing page emitter.
function teardown() {
  firstRoot.unmount();
  secondRoot.unmount();
  disposeExperiencesRootSdkBinding(binding);
  sdk.destroy(); // Borrowed binding disposal does not destroy it.
}
```

## Existing XDA event and handoff paths

Ordinary SSR uses Node fetch; CSR and browser-local navigation/actions use Web
fetch, accepting existing type-tagged arguments or raw built events with SDK
construction once. Only an actual hybrid server-to-browser transfer uses Node's
route-descriptor-only producer and optionally consumes the explicitly supplied
full handoff in Web/React, independently of display. Normal fetching needs no
handoff. Same-ID Retry/later comparison IDs use ordinary event-free fetch without
builders/hooks/replay; accepted incoming replay delivery retry remains queue-owned.
See [Runtime XDA contract](../packages/runtime/README.md#xda-preflight-and-profile-finalization); Phase 6 implementation, checks and review are recorded in the implementation plan; the user explicitly accepted completion on 2026-11-02.

## Shared request and event sequence

The route owner builds initial events once for the officially supported one Experience fetch per page; repeated presentations may reuse a plan. SDK source/presentation ports retain ordinary in-flight sharing and lifetime guards. Reference multi-ID loops exist only for rendering-scenario comparison, not a supported product pattern, SDK chaining controller or cross-fetch contract.

1. Establish preview policy and await required source initialization; preview is event-free.
2. In SSR use ordinary Node fetch; CSR/local navigation uses ordinary Web fetch.
   Supply page/optional initial URL identify arguments once through existing
   personalization options; the SDK builds admitted arguments once. Direct
   identify/page is not an initial prerequisite or compensation. The ordinary
   request does not mark Web replay/page-route acceptance or require commit
   confirmation; tolerate upstream noncommit absent blocking errors.
3. Fetch the one supported Experience descriptor with the appropriate registry/source
   map and reuse its plan. Later reference comparison IDs use ordinary event-free
   fetch, without SDK multi-Experience or cross-fetch guarantees.
4. In an actual hybrid transfer, that server content fetch uses Node's
   `fetchExperienceForHandoff(..., { routeKey })` and returns the full result.
   Presentation/root reuse that result; finalized replay survives content failure.
   Without optional prefetch, the actual descriptor's content fetch still produces
   it, with no XPAPI preparation fallback or descendant inventory.
5. Present selected content independently. Optionally consume an explicitly supplied
   server handoff in Web/React under current consent, scope/schema/cache/capacity and
   lifetime guards. Browser replay commits the supplied batch; CSR/SSR XDA events
   remain uncommitted pending upstream support, without an SDK workaround/force flag.
6. Browser takeover preserves server HTML/plans without startup refetch. Browser-local
   navigation/actions use ordinary Web fetch absent a new server handoff. Same-ID
   content Retry has no events/builders/hooks/replay; delivery retry stays queue-owned.

The root retains route matching, initialization joining and truthful terminal outcomes. Source/presentation controllers retain descriptors, loading/error/plan state and Retry/refresh; Runtime/Node/Web retain builders, consent, interception, queue policy and stale/reset/lifetime enforcement. No stateless `content-cycle.ts`, pageResult prerequisite, per-descriptor identify, complete-plan inventory or extra transaction framework is required.

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

### Route decision table

| Trigger                                                                       | Event decision                                                                                     | Content decision                                                                           |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Managed CSR activation/navigation                                             | Supply page/optional initial identify to ordinary Web fetch; no local replay/commit                | Display selected plan; later comparison IDs use event-free fetch                           |
| Hybrid initial document                                                       | Server evaluates through Node producer; optional explicit browser consumer commits supplied replay | Reuse full result for presentation/root; preserve SSR HTML/plans, no startup refetch       |
| Ordinary SSR, including optional browser analytics without transferred replay | Ordinary Node XDA intent remains uncommitted pending upstream support                              | Server fetch/resolve/render; optional analytics does not turn normal fetch into a transfer |
| Identify/CUSTOM TRACK                                                         | Fresh nonpage intent through ordinary fetch, no local handoff                                      | Use plan/error independently; Page Two navigation still carries a page                     |
| Same-ID Retry/refresh                                                         | No events, builders, event hooks, publication, admission or replay                                 | Ordinary event-free fetch of the same descriptor; keep usable content                      |
| Incoming accepted replay delivery retry                                       | Existing queue owns retained event IDs/target/locale                                               | No content Retry or application recommit                                                   |
| Consent change                                                                | Preserve pinned implicit page retry exception; blocked nonpage events stay dropped                 | No application refetch/page callback                                                       |
| Reset                                                                         | Invalidate old work and remove attribution before reset                                            | Fresh visitor cycle; reject old plans/profile/handoff                                      |
| Live preview                                                                  | No visitor events/replay/handoff                                                                   | Bound source; SSR-only updates use server round-trip                                       |

Consume the pinned Web `hydrateAndTrackCurrentPage` complete aggregate operation with fallback only for page-bearing refused replay or explicit page intent and accepted-route tracker; do not port the obsolete emit/skip API, first-route hook skip or post-terminal acceptance marking. Keep one stable root across replay/nonreplay navigation. Matching replay supersedes a pending optional initial callback, and late completion cannot emit a competing page. Eligible page refusal can be reinvoked through existing consent-reactive mechanics; blocked nonpage events are dropped, and accepted replay is never resubmitted or replaced by fallback on HTTP failure. Preserve preview/reset/destroy and owner guards; a refused integration handoff does not authorize bypassing consent.

## Serialization cache and identity boundaries

`PortableRenderPlan` and `ExperiencesHandoff` remain separate. Adapt Optimization's browser handoff metadata with route identity, content-rendering policy and initial-event responsibility alongside the validated runtime handoff. No plan or profile ID alone proves server page completion. React provider/root consume `handoff?: ExperiencesHandoff` directly using current browser route; presentation policy and supplied plans do not create another event/state producer. Preview initialization contains browser-safe plan/session inputs without visitor state or replay. Malformed inputs and mismatched scope/route are rejected before state/event work.

Next's `route-key.ts` is shared by its server, App Router and Pages Router paths. Normalize pathname plus `URLSearchParams(...).toString()`, omit the hash and Next transport-only `_rsc`, preserve meaningful query order and repeated values, and use the host's configured base-path/locale/trailing-slash treatment consistently. Thus `?q=hello%20world` and `?q=hello+world` match. A route key is neither authorization nor a cross-visitor cache key.

Next's `serialization.ts` validates resolved props and metadata as JSON-safe data before crossing the server/browser boundary. Reject functions, symbols, bigint, cycles, non-finite numbers and unsupported class instances with a path-specific server error; do not silently stringify or drop application data. Set the browser plan's required `diagnostics` field to `[]` and omit optional `deliveryDiagnostics` and embedded personalization by default. Keep server diagnostic access, attribution, slots, ordinary design/content/resolved props, and explicitly approved metadata. Pass final visitor state only through the validated private handoff, defaulting to the final profile ID rather than serializing server-only profile fields. Escape `<`, U+2028 and U+2029 when embedding JSON in HTML; use normal React escaping for markup.

Private request outputs and preview responses use `Cache-Control: private, no-store` and preserve required framework `Vary`/other response headers. Personalized fetches cannot enter the Next Data Cache: use Runtime's supported `delivery.fetch` configuration to wrap ordinary Delivery calls with `cache: 'no-store'`, and preserve caller fetch behavior with no-store precedence. Direct CPA fetching can use the equivalent `preview.fetch` path. The frozen session helper cannot accept a custom fetch wrapper: do not inject one into session preview configuration and then reject it as unsupported. Session calls run outside cached functions in a route explicitly configured for dynamic no-store fetching; do not claim arbitrary transport-option forwarding. No cross-cycle private content cache is added. A static/public API requires explicit cache policy, no profile/identity/replay or identify intent, and a complete permutation key covering content identity/revision, scope, locale, parameters and selection dimensions. Cache metadata validation does not itself set HTTP headers.

The host supplies consent independently of the identity cookie. Append identity `Set-Cookie` only when `canPersistProfile` permits it and only with state available at that response boundary; preserve other cookies. Pages Router and explicit response owners persist after final content evaluation. App Router uses Optimization's middleware persistence followed by browser state hydration, as specified below. Expire identity under the explicit application withdrawal/reset policy. Preview content does not write or expire identity. Browser/server consent snapshots do not become Web startup defaults: configured defaults intentionally override persisted choices and are reserved for actual application defaults. Server credentials and resolver functions remain server-local; browser configuration uses an allowlist and supported browser credentials.

## App Router request and response flow

Use standard Next hosting, as explicitly directed by the user. Port Optimization's middleware/request-family/provider flow. No custom server, full-plan request headers or continuation store is part of this design.

1. The context handler sanitizes SDK-owned headers and forwards request URL/consent/identity context. Resolve preview policy before visitor operations. Ordinary middleware may forward context without emitting initial page/identify; event-bearing XDA evaluation belongs to the content owner. Use supported Node middleware on Next 15.5 and keep Node imports out of Edge paths. Independently committed middleware actions retain truthful outcome metadata but are not an initial-content prerequisite.
2. React `cache` shares one render-local request initialization/facade across request-family components. Do not transfer a facade between middleware/render execution contexts or infer commit from a profile ID. Build initial page/identify once for the route’s event-bearing XDA fetching.
3. The host maps request context into `forRequest()`, then fetches the actual single
   Experience descriptor before rendering the browser root. For an actual transfer,
   `fetchExperienceForHandoff(descriptor, resolveOptions, { routeKey })` returns
   the full result: presentation uses its plan and the root receives its handoff.
   Ordinary SSR uses `fetchExperience`. Future convenience families must memoize
   that real descriptor fetch result for both view and root; optional preloading
   is separate and not required. Do not return to XPAPI preparation, require
   descendant inventory or add a root DSL/API family. Reference-only later
   comparison IDs use ordinary event-free fetch.
4. Render selected plans independently of replay. Serialize browser-safe plans, route/render policy and private built-batch/profile handoff through normal props/Flight boundaries. SSR-only keeps a server subtree; hybrid adopts the supplied plans without a startup fetch. No full plan travels in request headers.
5. The browser attaches one live owner, preserves initial content and performs existing hydration/admission/replay with the XDA-returned ID as continuation fallback. CURRENT whole-batch gating/refusal/fallback applies. No competing initial page or replay-success display barrier is introduced. Preserve non-emitting handling only for verified independently committed matching routes through existing ownership, without an emit/skip API; later navigation has one owner. Phase 7/10 integrate the pinned implicit page retry on consent changes without explicit retry machinery.

**Cookie persistence follows Optimization:** Its browser profile effect stores the profile and calls `setAnonymousId`, which writes `ctfl-opt-aid` and the stored anonymous ID when persistence consent is granted. Handoff hydration updates that profile. Experiences already has the equivalent effect and `IdentityCookie.persist`, so the final hydrated ID replaces an earlier server-written ID without an extra page, profile fetch or synchronization protocol. Cookie/local state hydration does not finalize a provisional XDA profile or gate content display. This is existing behavior to reuse, not an outstanding integration issue. Without a browser runtime, server-rendered content remains usable and the cookie reflects identity available at the response boundary; Pages Router `getServerSideProps`, Route Handlers and Server Actions can persist their own final evaluated state before returning.

The source chain is Optimization `request-handler.ts` → `getNextjsServerOptimizationData`/`persistNextjsAnonymousId` → `app-router-request-runtime.tsx` → React `OptimizationProvider.tsx` → Web `handoff.ts` → React `useAutoPageEmitter.ts` → Web `trackCurrentPage`. Experiences must apply necessary private profile state internally during the complete operation, retaining consent-gated cookie/persistence behavior and profileless continuity. No new cookie synchronization protocol is required.

Next's [cookies API](https://nextjs.org/docs/15/app/api-reference/functions/cookies), [middleware API](https://nextjs.org/docs/15/app/api-reference/file-conventions/middleware), and [15.5 release](https://nextjs.org/blog/next-15-5) establish the supported response and Node middleware boundaries. They do not make a middleware page equivalent to final XDA content evaluation.

### Request classes and route ownership

| Request or transition                       | Server behavior                                                                                                                                         | Browser behavior                                                                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Initial ordinary document                   | Context forwarding; render owner supplies initial arguments for SDK-built XDA events, selects content and packages the built batch and selected profile | Preserve state/plans and admit exact replay once with returned-ID continuation fallback; suppress duplicate emission only for verified independently committed matching routes |
| Prefetch/speculative RSC                    | Context forwarding only; no page, identify-bearing XDA request, private initial handoff or cookie mutation                                              | No page/content activation until actual route commit                                                                                                                           |
| Hybrid client navigation                    | Return routing/client composition inputs; do not run another server event/content cycle                                                                 | Web fetches XDA with built events and one actual-intent owner; content does not await commit                                                                                   |
| Hybrid `router.refresh()`                   | Do not repeat page or event-bearing XDA initialization                                                                                                  | Preserve live owner/current content; explicit content refresh uses Web `fetchExperience` through the presentation controller                                                   |
| SSR-only navigation without browser SDK     | Ordinary document links; no prefetch                                                                                                                    | Server uses ordinary Node fetch and renders; XDA-carried events remain uncommitted pending upstream support                                                                    |
| SSR-only with browser analytics             | Ordinary document navigation remains available; explicit content/preview refresh performs a server render without another page                          | Analytics-only provider does not instantiate managed content; use a server round-trip for updates                                                                              |
| Explicit server mutation/refresh            | Route Handler/Server Action owns its own preparation and final cookie persistence; no automatic replay of a successful page                             | Await the operation, then apply refreshed server content; preview uses no visitor initialization                                                                               |
| Pages document                              | `getServerSideProps` shares one facade, performs the declared sequence and appends final identity cookie before return                                  | `_app` preserves plans and owns applicable exact replay; verified independent matching commitments remain non-emitting through the existing owner                              |
| Pages hybrid client navigation/data request | Server returns client composition inputs without a competing XDA event/content cycle                                                                    | `_app` uses committed `asPath`/readiness and the same React/Web sequence                                                                                                       |

Use the selected Next version's request headers and router state only to classify rendering/activation; never treat them as authorization. Next's prefetch machinery is not an event owner. Private routes disable link prefetch where necessary, and the server still guards speculative work. In the reference, App Router uses `/` and `/page-two`; Pages Router uses distinct `/pages` and `/pages/page-two` paths in the same app. Equivalent visible search encodings normalize identically. Hash-only and shallow UI changes do not emit a page; meaningful pathname/query commits do. Canceled transitions do not start a new cycle. Back/forward is a committed navigation, not permission to reapply an old visitor's handoff. Redirect/error outcomes do not fabricate page success.

After Reset, retain the existing owner/reset generation guard and invalidate initial-plan/handoff adoption before accepting restored router data. For the specific back/forward regression, clear old attributed content and reject a cached initialization belonging to the prior owner lifetime. Use Next's existing refresh/navigation behavior for recovery; add no cross-visitor cache or restoration framework. This is verified by the planned phase-10 live flow and one owned decision test.

### Next API shape and typed usage

Retain Optimization's binding families and option groupings. Server binding configuration contains Node configuration plus `config: ResolverConfig`, a server render registry, consent resolver, cookie options, request policy and a request-preview resolver. Strip these binding-only fields before constructing the stable Node SDK. Client configuration contains browser-safe Web configuration plus its browser registry. Client component references can be supplied to the server binder separately, as in Optimization; callbacks and credentials never cross serialization.

The handler and server binding receive the same application-owned `livePreview` resolver, which maps deployment settings and request/session inputs to the Node request initializer. This adapts the request-context mapping to XDA Preview Sessions; it does not add another preview-policy flag. Each execution context evaluates that resolver before `forRequest`, and the runtime remains the policy authority. The middleware need not load the optional module because it performs no content operation. The render facade loads it when required. A failed resolver aborts preparation without page/cookie work; a failed initializer retains preview policy and error state. Browser setup reconstructs its initializer from safe serialized binding data plus separately configured browser credentials before page/tracking work.

```ts
type NextjsLivePreviewResolver = (context: {
  request: NextjsRequestLike;
}) =>
  RuntimeLivePreviewInitializer | undefined | Promise<RuntimeLivePreviewInitializer | undefined>;
// Both binding configurations add this optional field.
interface NextjsRequestPreviewOptions {
  livePreview?: NextjsLivePreviewResolver;
}
```

Optional `prefetchExperiences` retains pinned naming/memoization for separate
preloading of the one supported Experience. Without it, the actual hybrid descriptor
content fetch uses Node's route-descriptor-only producer and yields the full result
reused by presentation/root. Use ordinary Node fetch for SSR and ordinary Web fetch
for CSR/local actions. No XPAPI preparation fallback, descendant inventory,
`PreparedExperiences`, `PrepareExperiencesOptions`, `pageResult`,
`prepareExperiences`, mode flags or resource framework is specified.

Official support is one Experience per page, unenforced. Reference multi-ID comparison loops use ordinary event-free fetch for later IDs and reuse plans, without SDK ownership or cross-fetch guarantees. Safe plans and optional actual server handoff cross the framework boundary; functions/SDK instances stay server-local. Next remains phases 9–10.

The ordinary hybrid example below uses the Node request facade directly.
`requestLocale`, `permittedProfile`, `visitorConsent`, `pageProperties`,
`userAgent`, `userId` and normalized `routeKey` are host-derived values for
this request, not shared server state. `BrowserExperiencesRoot` is an
application-owned component imported from a client module; it supplies browser-safe
configuration and forwards the full handoff to the existing React root. It does
not prepare a second handoff. Native type-tagged arguments are built once by the SDK.

```tsx
import 'server-only';
import {
  configureNextjsServerExperiences,
  ServerExperienceRenderer,
} from '@contentful/experiences-nextjs/server';
import { BrowserExperiencesRoot } from './browser-experiences-root';

const sdk = configureNextjsServerExperiences(serverConfig);

export default async function Page() {
  const requestContext = {
    locale: requestLocale,
    profile: permittedProfile,
    consent: visitorConsent,
    eventContext: { page: pageProperties, userAgent },
  };
  const request = sdk.forRequest(requestContext);
  try {
    // This response actually transfers server-evaluated intent to the browser.
    const result = await request.fetchExperienceForHandoff(
      {
        experienceId: 'home',
        personalization: {
          events: [
            ...(userId ? [{ type: 'identify' as const, userId }] : []),
            { type: 'page' as const, properties: pageProperties },
          ],
        },
      },
      { config: serverRegistry },
      { routeKey }
    );

    return (
      <BrowserExperiencesRoot handoff={result.handoff}>
        {result.plan ? (
          <ServerExperienceRenderer experience={result.plan} config={serverRegistry} />
        ) : (
          <p>Content unavailable.</p>
        )}
      </BrowserExperiencesRoot>
    );
  } finally {
    request.destroy();
  }
}
```

The result's available plan renders independently of replay; its full handoff is
still forwarded when content fetch/resolve returns an error. Apply the serialization,
privacy/cache and browser-safe-data rules above at the framework boundary.
Ordinary SSR calls `request.fetchExperience(descriptor, resolveOptions)` and
renders its plan without producing or requiring a handoff, as in the examples below.

The future `bindNextjsAppRouterServerExperiences` convenience family must memoize
the actual descriptor fetch result for both presentation and root; the root cannot
independently prepare intent before the content descriptor is known.
`request.prefetchExperiences` retains its pinned callback shape for optional
separate preloading and is not required for this flow. The context handler shares
Node configuration, consent policy and preview resolver; context-only forwarding
cannot claim page commitment. Client binder configuration stays browser-safe in a
client module. Preserve the SDK's implicit consent-change page exception through
the existing root/router ownership, without a new explicit retry scheduler.

```tsx
// SSR-only: server content remains a Server Component subtree.
// plan comes from ordinary request.fetchExperience; no handoff is needed.
// Only an actual server-to-browser transfer uses the Node producer and supplies handoff.
const content = <ServerExperienceRenderer experience={plan} config={serverRegistry} />;

// No browser analytics: return content directly.
// Optional analytics: this client component receives server children and no plan loader.
return (
  <ExperiencesAnalyticsRoot
  // Supply handoff only if an actual server transfer produced it.
  >
    {content}
  </ExperiencesAnalyticsRoot>
);
```

`ExperiencesAnalyticsRoot` ports Optimization's analytics-only root. Browser configuration belongs in its client module. It exposes consent/identity/actions/tracking and optional `states.preview` revision observation, with no browser fetch/resolve/content renderer. An SSR-only update invokes the application's server round-trip and returns another server subtree.

```tsx
// Explicit/static server path reads no next/headers or cookies.
import {
  configureNextjsServerExperiences,
  ServerExperienceRenderer,
} from '@contentful/experiences-nextjs/server';
const sdk = configureNextjsServerExperiences(serverConfig);
const request = sdk.forRequest({ locale: 'en-US', consent: false });
const plan = await request.fetchExperience(
  { experienceId: 'public-home' },
  { config: serverRegistry }
);
request.destroy();
return <ServerExperienceRenderer experience={plan} config={serverRegistry} />;
```

Explicit static callers provide cache policy and public permutation dimensions separately; they pass no visitor identity, identify intent or private handoff, and do not infer personalization from the static route. The free `fetchExperience` path remains valid. Explicit private request callers receive a `persist(response)` helper alongside prepared initialization and invoke it at their supported response boundary.

In Pages Router, `getServerSideProps(ctx)` maps `ctx.req`, the visible route,
independent consent and permitted identity into host-owned request context, then
calls `sdk.forRequest(requestContext)`. For an actual transfer, fetch the single
Experience through `request.fetchExperienceForHandoff(descriptor, resolveOptions,
{ routeKey })` using native builder arguments built once by the SDK; return
browser-safe props containing the available plan and the returned full handoff.
The view renders that plan and `_app` forwards the handoff to the browser root,
without another producer. Ordinary SSR uses `request.fetchExperience` and
returns plan props without requiring a handoff. At the supported `ctx.res`
boundary, write or expire the identity cookie using current request state and
`canPersistProfile`, preserve other cookies and private/no-store headers, and
apply the preview policy above; destroy the facade in `finally`.
`bindNextjsPagesRouterServerExperiences` and its client counterpart
`bindNextjsPagesRouterExperiences` remain optional future factories around this
descriptor-aware flow. They must memoize the real fetch result for view/root reuse;
optional preloading is separate, and no descriptor-free XPAPI preparation recipe
applies. Preserve the SDK's implicit consent-change page exception without adding
an explicit retry scheduler.

## Reference increments and validation ownership

The reference baseline is [implementations/AGENTS.md](../implementations/AGENTS.md), the three operational READMEs and their source. Default IDs remain `3fLAdFb3BYAuImRhcW8k4t` (Coded), `4WzbgzPQHa9Tr2ffbOU8p7` (Composed), and `7u2eP09B4BIBToH8UwSHck` (Personalized Composed), with the same optional override. Home presents all three automatically and the first manually; Page Two presents the last automatically and the first manually. The Node-only reference retains its existing route set.

Preserve the theme, Utilities/split layout, `title`, `text`, Rich Text and delivered named slots, both component/template registrations, repeated plan reuse and real source-map attribution. Grant/Revoke updates consent UI without application page/refetch calls; the SDK retains the pinned implicit page retry exception; Identify supplies URL intent; Retry uses ordinary same-ID event-free fetch without builders/hooks/replay; Reset removes old content/intent before starting a new visitor cycle; Page Two's CUSTOM TRACK action uses ordinary track-only XDA intent; navigation still carries a page. Sidebar counts actual browser attempts and real interval IDs, never server events or delivery confirmations. A 200/profile ID does not prove personalized content: retain baseline/partial-content reporting. Necessary App Router persistence and SSR-only notification limits above remain visible.

| Phase | Usable permanent increment                                                                                                                                                                                                                                                                                | Proportional inspection                                                                                                                                                                     |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2     | Existing Node snapshot loading, Web fetching/shared preview updates, hybrid initial snapshot adoption plus subscription. Preserve ordinary flows, app-local environment, renderers and routes. Add optional browser asset preparation, public config allowlist and operational guidance only as required. | Snapshot/update/status, no preview visitor events/cookie mutation, no hybrid startup snapshot, disabled production bundle exclusion, disposal/error reporting within public package limits. |
| 3     | React tarball consumer shell, installed dependencies, local assets/configuration, Nx and scoped PM2 lifecycle; no placeholder loading.                                                                                                                                                                    | Install/build/start shell and artifact entries.                                                                                                                                             |
| 4     | Real registrations, layout, slots, Rich Text, repeated/manual roots using current free `fetchExperience` and supplied-plan rendering. Keep this as the supported application-owned loading path.                                                                                                          | Standard renderer/DOM bindings with real plans; no dependency on phase-7 orchestration.                                                                                                     |
| 5     | Managed/injected binding, state/consent controls, automatic/manual registration, early attempt sidebar and common teardown on the same shell.                                                                                                                                                             | Ownership, subscriptions, controls and tracking supported by available APIs.                                                                                                                |
| 6     | Correct existing Node/Web/hybrid event-bearing XDA flow, finalized-batch companion, actual Node transfer/optional explicit Web consumption, necessary React handoff-prop migration and affected docs; managed loaders stay Phase 7.                                                                       | Focused maintained no-network owner/React boundary tests must verify optional-page replay, aggregate ownership, consent/failure/Retry/lifetime and replay-independent display.              |
| 7     | Managed presentation and shared route initialization; full Identify/Reset/Retry/navigation and thin preview binding integration.                                                                                                                                                                          | Compare ordinary/preview page and content counts, initialization recovery, stale results, tracking and final exit/BFCache behavior with Web.                                                |
| 8     | Completeness/parity checkpoint over accumulated React functionality.                                                                                                                                                                                                                                      | Reuse evidence; repeat only changed or missing cases.                                                                                                                                       |
| 9     | Next tarball consumer, common explicit request/preparation/serialization helpers and actual server rendering. Use the explicit server surface in the permanent app before request-family/response/browser bindings arrive.                                                                                | Build and inspect real prepared server plans/final handoff; cookie decision helpers are unit checked without claiming complete router integration.                                          |
| 10    | App/Pages binding in one app, standard middleware and response flows, browser takeover, controls/navigation/preview.                                                                                                                                                                                      | JavaScript enabled/disabled documents, known persistence boundary, no startup duplicates, speculative work suppression and Reset → back/forward.                                            |
| 11–12 | Next parity and integrated current-XDA checks.                                                                                                                                                                                                                                                            | Reuse prior evidence; verify actual wire conversion/counts and material integration gaps without new infrastructure.                                                                        |
| 13    | Migrate Next example, add the planned React example, finalize import/preview migration docs and release prerequisites.                                                                                                                                                                                    | Example production builds and combined artifact/version checks. Other framework examples/adapters remain untouched.                                                                         |

Reuse `scripts/install-implementation.ts`, pack targets and existing reference asset preparation. Keep apps outside npm workspaces with local tarball dependencies/overrides, explicit public configuration, scoped generated paths/ports/processes and preserved `.env`. Add no service fixtures, app-level test runner or separate consumer.

### Source and test ownership

For the current Phase 6 corrections, delete tests asserting rejected behavior and add focused maintained no-network unit/contract cases and run proportional existing checks. Future-phase tests for genuinely new owned logic are colocated with the complete owner of the tested decision. The source paths below are implementation assignments, not source changes in phase 1. Reuse existing setup/disposal helpers; cases use ordinary functions/spies/deferred promises and no network.

| Owner and planned source                                                                                     | Existing evidence inspected                                                                                                                                                                                       | New logic to verify                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime `live-preview.ts`, structural types                                                                  | Live Preview `fetch-preview-session`, `live-preview-client`, `preview-session` and their snapshot/attribution/status tests; Runtime `create-runtime-delivery-client.test.ts` and `contentful-experiences.test.ts` | Supported mapping/rejection, structural module compatibility and snapshot adoption. Do not duplicate protocol/retry tests or edit the frozen package.                                                                                                                                                                                               |
| Node request facade and snapshot integration                                                                 | `contentful-experiences.test.ts` isolation, resolver precedence, XDA profile replacement/stale response and preview suppression; `handoff.test.ts`                                                                | Initializer-before-policy sequencing, matching source, shared initialization, request disposal and no preview profile mutation.                                                                                                                                                                                                                     |
| Web shared preview source/fetch/binding                                                                      | Public observable implementation, `contentful-experiences.states.test.ts`, delivery/lifecycle/preview/handoff/SSR suites; Optimization presentation controller/snapshot/loading tests                             | In-flight sharing, fetch/update ordering, normal preview observable, thin binding without snapshot fetching, operation guards, SDK source cleanup and inert snapshot state.                                                                                                                                                                         |
| Web page tracker and existing prepared submission                                                            | Existing reference page→fetch sequencing; Runtime event methods and Node/Web current-page/consent tests; Optimization root/auto-page/current-page implementation                                                  | Finalized optional-page replay, live-profile/provider/handoff precedence, CURRENT gating with page-bearing-only fallback and accepted-route ownership with lifecycle guards; replace rejected behavior tests with focused maintained no-network correction cases; no Runtime content-cycle or content eligibility gate.                             |
| React provider/root/hooks/host binding                                                                       | Optimization provider/root, `optimizationRootRuntime.ts` and their tests; hooks/action tests; Experiences Web snapshots and React hook suites                                                                     | Commit-only owned construction, injected replacement, independent roots, stable snapshots/actions, cleanup, root readiness and presentation selection using existing Optimization controllers; initial XDA-built events, plan reuse, replay-independent display, content-only Retry and implicit consent-change page exception through pinned APIs. |
| React existing renderer/`ExperienceNode`                                                                     | `server-renderer.test.tsx`, `nodes-renderer.test.tsx`, `attribution-hydration.test.tsx`, prop-resolution/composition tests                                                                                        | Container/node attributes, root/ref forwarding, repeated/multiple roots, manual cleanup and stable server/browser output. Preserve existing rendering assertions.                                                                                                                                                                                   |
| Next `server.ts`, `request-context.ts`, `request-handler.ts`, `cookies.ts`, `handoff.ts`, `serialization.ts` | Pinned Next server, Pages server, request-handler, cache middleware and App Router tests; Experiences Node/handoff tests                                                                                          | Explicit request mapping, trusted sanitized context, applicable handoff capture, response-bound cookie decisions, JSON/HTML safety, private cache policy.                                                                                                                                                                                           |
| Next router bindings and `route-key.ts`                                                                      | Pinned App/Pages binders, root/page emitter tests and normalization helpers                                                                                                                                       | Equivalent encoded queries, document/prefetch/RSC ownership, matching optional-page replay with page-bearing-only fallback, canceled/committed transitions, SSR-only boundary and old initialization rejection after Reset.                                                                                                                         |
| Package exports/packaging scripts                                                                            | Current React entry checks, tsup/project configuration, pack/install helpers and Nx release settings                                                                                                              | Entry/declaration graphs, client directives, optional preview exclusion and installed tarball builds in the maintained references.                                                                                                                                                                                                                  |

Do not copy runtime consent, queue, handoff parsing, Core resolution or protocol tests into adapters. If adapter-owned decisions expose an existing lower-layer gap, assign it back to that owner. The seven existing Web observables retain their meanings; `states.preview` adds the shared source without reinterpreting Personalization request state. React/Next port Optimization's existing source/presentation controllers and consume the thin binding; do not create a second custom resource framework. No new generic lifecycle or state framework is specified.

### Delivery and acceptance

Keep implementation and review changes unstaged under the plan's Git policy; stage only for a ready, explicitly requested commit or an explicit staging request.

Phase 1 produces this design and updates the working plan. Work remains local under the plan's explicit Git instruction policy: no phase authorizes commits, pushes, PR creation, or stack publication, and agents must not suggest or solicit those actions. They are not phase-completion or acceptance requirements. Explicitly requested local commits also require a separate descriptive branch for each code phase, based on the preceding code phase (or the agreed integration base for the first); never append a later phase's commit to the preceding phase's branch. Only if the user explicitly instructs publication, those phase branches receive separate PRs in the same GitHub Stack. Checkpoint-only phases need no empty branch. One owner updates shared exports/configuration/stack dependencies. Publication does not authorize phase acceptance or merging. All phase PRs remain unmerged until the entire stack is accepted/approved, final checks pass and merge is authorized.

The breaking React entry/preview migration ships with its Next consumer and example migration in the complete stack. Other shared leaf changes are additive, the frozen optional package remains compatible, and all unaffected adapters retain their public dependencies. Nx independent release versions and dependent ranges must be checked together; initialize the new Next package at `0.0.0` and validate the required pre-introduction release baseline in phase 13 before merging. No tags, pushes or releases occur during phase 1. A rollback reverts the coordinated migration, rather than mixing new consumers with old adapter exports.

Later implementation validation uses scoped Nx owner checks and permanent reference builds/live inspection as assigned above. Final root build/test/lint/typecheck/format and maintained example/reference production builds run once against the complete changes, with repeats only for relevant changes or failures. This design has not executed those future checks or demonstrated browser behavior. Phase-1 validation is source/signature consistency, source-link verification and review against the checklist.

Cookie persistence is covered by Optimization's existing browser hydration/persistence pattern and its Experiences counterpart. A possible initial SSR-only preview refresh is documented best-effort behavior, not an unresolved design issue or a reason to wait for upstream changes. Add verified preview shortcomings and follow-up capabilities to the consuming SDK/adapter READMEs alongside their package work: the shared Runtime record and Node/Web notes in phase 2, React notes in phases 3–5 and 7, and Next notes in phases 9–10. Phase 13 reconciles those notes. The original phase-1 increment changed only this design and the implementation plan. The user approved the shared-source replacement during phase 2; unrelated named contracts and sequential gates remain intact. Phases 1–5 remain complete and accepted. Historical Phase 6 acceptance is superseded; prior remedy checks/review remain historical. Current implementation, checks and acceptance review are recorded in the implementation plan. Phase 6 is complete and explicitly accepted on 2026-11-02. Phase 7 is implemented and awaiting user acceptance; its Phase 6 gate is satisfied. Current status and authorized refinement publication are maintained in the implementation plan.

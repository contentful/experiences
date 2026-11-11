# Node + Web SDK reference implementation

Official support is one Experience fetch per page, without code enforcement.
Reference multi-ID loops exist only to compare rendering scenarios, not as
supported product usage or a cross-fetch guarantee.

- Phase 6 implementation/checks are pending for the current correction; earlier
  checks/review are historical. Phase 6 is unaccepted/incomplete; Phase 7 stays gated. Replay-less aggregates apply state
  internally and return `{ accepted: false }` unless explicit `buildPayload` supplies
  page intent. Only page-bearing intent participates in route deduplication.
- Read the parent implementation instructions and this app's README before editing.
- Keep this application outside root workspaces. Consume installed local tarballs
  of the public Node/Web SDKs with Client, Runtime and Core overrides. Use the
  maintained installer and pack both dependency chains. No workspace source aliases,
  internal Runtime imports, SDK changes, or adjacent Optimization runtime dependency.
- Use app-local npm tools through `implementation-node-sdk-web-sdk` Nx targets.
  Refresh setup/install after SDK artifact changes; asset build copies only the
  installed Web UMD/map and bundles Rich Text/pure tracking helpers separately.
  Build shared.ts once to private dist; copy the same JS bytes for browser use.
  Shared SDK references are type-only; SDK execution stays in runtime adapters.
  `public/dist` is generated; the local Web theme retains its pinned provenance.
- Runtime reads only this app's ignored `.env` via dotenv. Preserve it during
  installation and cleanup. Keep `.env.example` credential-free. The ordinary public
  configuration allowlist is `SPACE_ID`, `ENVIRONMENT_ID`, `CDA_TOKEN`, `LOCALE`,
  resolved `EXPERIENCE_IDS`. `PORT` and unrelated settings stay private. CDA_TOKEN
  must be appropriate for public browser use; never copy management or server-only preview credentials.
- Serve only public assets, explicit Home/Page Two routes, and API-free health.
  Bind to loopback. Missing routes/assets return 404; never serve the app directory.
- Server integration is actual EJS SSR and an actual server-to-browser transfer.
  Supply page/optional identify intent once through Node `fetchExperienceForHandoff`
  with third argument `{ routeKey }` only. Retain the returned full handoff plus
  optional plan/error for optional browser consumption independently of display.
  Producer hooks run sequentially; ordinary fetch chains remain concurrent. Retain
  raw final Client events/query arrays unchanged, without server replay-compatibility
  validation before XDA. SDK builder XPAPI and Client XDA validation suffice for
  normal inputs; raw transmission is consumer-owned risk. Receiving validation and
  admission remain, and refusal leaves available content usable. Later comparison IDs and same-ID Retry use ordinary event-free fetch; handoff
  is never content input. Preserve source maps, plan reuse and diagnostic privacy.
- Browser activation observes `sdk.states.consent`; the immediate snapshot and later
  changes reinvoke the existing `hydrateAndTrackCurrentPage(handoff, { routeKey,
isCurrent })` operation independently of SSR display. One stable operation lifetime
  guard reaches SDK state/admission; coalescing respects any live caller and accepted
  queue work remains SDK-owned. Add no extra page call, startup refetch, CSR capture,
  dedicated retry facility or mode detector; preserve the SSR DOM. Capture the operation's
  target before hydration: current live profile, configured anonymous provider,
  then `handoff.profileId`. Ordinary requests remain provider-first. Exact finalized
  events permit current consent restamping; browser continuity may supersede the
  XDA ID, so matching commit profile/response/selection is not guaranteed.
  Current browser consent/schema admits the whole batch or uses the gated
  page fallback only for page-bearing refused replay when eligible; nonpage replay
  never emits or falls back to a page. Refusal preserves permitted page eligibility;
  accepted replay cannot fall back or resubmit solely on delivery failure.
  Acceptance is admission, not delivery; blocked non-page events do
  not replay on grant. Preserve SSR on failure, request context, separate consent
  cookies, permitted identity, private/no-store bootstrap and diagnostics.
  The sibling Node cookie prohibition and Web static-host rule are sibling-local.
- Construct Web with profile/consent defaults omitted and automatic interactions
  enabled. Register manual roots from real data immediately; tracking starts on SSR
  HTML without a hydration gate. Explicit per-element controls coexist with automatic
  tracking and remain consent-gated. Attach optional subscriptions early. Analytics requires
  a complete profile at emission, from persisted browser state, XDA/Personalization
  responses, or full handoff state. An adopted cookie supplies Personalization
  request identity only. Preserve SSR on failure.
- Browser consent comes from SDK observables; mirror effective snapshots one way
  to independent app cookies. Grant/Revoke changes both axes with SDK commands,
  without content fetch/page calls. Release subscriptions on final exit and preserve
  the owner for BFCache; let the SDK finish its own hide/unload measurements.
- Keep actual server bootstrap separate from browser route rendering. Browser-local
  navigation/actions use ordinary Web fetch absent a new server-supplied handoff.
  Navigation carries page intent without repeating identify; standalone Identify
  and CUSTOM TRACK are fresh nonpage intent, without local replay or commitment.
  Same-ID Retry is ordinary event-free fetch without builders/hooks/replay; accepted
  incoming replay delivery retry remains queue-owned. SSR/CSR noncommit is a tolerated
  service bug awaiting upstream force-commit support, with no SDK workaround/current
  flag. See [Runtime's XDA contract](../../packages/runtime/README.md#xda-preflight-and-profile-finalization).
- Retain accepted aggregate replay identity across newer initialization within the
  owner lifetime; serialized A after B is refused for page/nonpage intent without
  state/event republication, recommit or fallback. New visitors/actions need fresh
  message IDs. Reset/destroy clear this history; consent withdrawal does not restore
  accepted/blocked intent on grant.
- Reset must synchronously invalidate app work, replace old attributed DOM, detach
  the pending visitor work, then reset the SDK and start a fresh page/fetch cycle.
  Normal removal finalizes before manual overrides are cleared; register new roots
  only after insertion. Check ownership after awaits and before further fetch/UI work.
- Preserve EJS/DOM registration, named-slot, prop and real attribution parity. Keep
  client partial content with generic diagnostic counts; never dump the strings.
  Custom track uses fresh nonpage intent through ordinary Web fetch, without local replay or commitment; evaluation does not promise commit.
- index.ejs owns both SSR markup and native template elements. Reuse its markup
  functions; the client clones native templates and never compiles/renders EJS.
- Match the Web reference theme, main-pane Utilities and split content layout.
- Keep the event-attempt sidebar optional and browser-owned: subscribe before
  hydration, retain it across routes, and dispose its subscription/age timer on
  final exit or failed activation. Preserve it for BFCache. Never fabricate server
  events or expose handoff/profile payloads. Group only actual interval IDs.
- Add focused maintained owner unit/contract tests with local doubles and no network
  for optional-page replay, consent/failure/Retry/lifetime and aggregate ownership.
  No network tests, MSW, E2E, mocks, service fixtures, simulated upstreams, verification
  runners, test-only hooks, transport workarounds or Optimization Live Updates.
  Validate using the actual install/build/lint/typecheck commands, installed exports
  and declarations, and direct shell/asset/health inspection.
- Typecheck covers server/build TypeScript; lint covers authored browser JavaScript
  when present. EJS and browser content property accesses are not typechecked.
- Stop/restart/status/logs must target only `experiences-node-web-sdk-app`.
  Preserve siblings, unrelated processes, local credentials and stack metadata.

- Optional preview uses request-local Node `livePreview`; Web retains SSR plans/DOM
  and attaches `subscribeToPreview` without a startup refetch. Navigation/Retry fetch
  and render before attaching listeners; `states.preview` exposes status. Skip visitor
  work/handoff and identity-cookie writes under `isPreview`; destroy Node facades in
  `finally`. Allowlist browser settings; seed plans without profiles or upstream
  diagnostic strings, retaining generic diagnostic counts.
  Build and host read app-local `LIVE_PREVIEW_ENABLED`; bundle installed preview
  artifacts only when enabled. Use `replaceLivePreview` for binding changes within
  preview and reload the document when entering or leaving preview.
  Release subscriptions on route replacement/final exit and retain them for BFCache.
  Keep `packages/live-preview` and local `.env` files unchanged.

# Node + Web SDK reference implementation

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
- Server integration is actual EJS SSR. Browser activation adopts state without
  startup refetch/page or DOM replacement. SDK-owned tracking observes existing SSR
  HTML independently of state hydration. The server owns the initial page attempt and
  ordinary identify action. This app commits ordinary XPAPI events on the server
  before profile-only content and uses state-only hydration; hydration does not
  finalize a provisional XDA profile. The SDK’s prepared replay remains supported.
  This flow does not demonstrate XDA server preview followed by browser submission.
  Preserve request-bound event construction, separate consent cookies,
  permitted identity, HTML-safe bootstrap, private/no-store caching and diagnostics.
  The sibling Node cookie prohibition and Web static-host rule are sibling-local.
- Use one Node SDK with a facade per request: submit requested identify once
  through `request.identify()`, then attempt the owned page. Content uses the SDK’s
  evaluated identity when available, without a page-result/profile eligibility gate.
  Fetch independent distinct IDs concurrently once with source maps and capture
  response state through the public Node producer after those requests settle.
  Keep diagnostic strings out of automatic UI/logs/bootstrap.
- Construct Web with profile/consent defaults omitted and automatic interactions
  enabled by default. Register manual roots from their real data before awaiting
  state-only hydration. Tracking observes existing SSR HTML and later DOM changes
  without a hydration gate; explicit
  per-element controls coexist with automatic tracking and remain consent-gated.
  Attach optional diagnostics/control subscriptions early; they do not gate tracking.
  Analytics requires current profile identity at emission, which may come from
  persisted browser state, an adopted cookie, or the handoff. Preserve SSR on failure.
- Browser consent comes from SDK observables; mirror effective snapshots one way
  to independent app cookies. Grant/Revoke changes both axes with SDK commands,
  without content fetch/page calls. Release subscriptions on final exit and preserve
  the owner for BFCache; let the SDK finish its own hide/unload measurements.
- Keep startup separate from client route rendering. Navigation/back/forward sends
  one page before concurrent independent distinct fetches. Identify submits one
  ordinary contextual SDK action per explicit intent; navigation and content Retry
  join pending visitor work without repeating identify. Retry emits no extra page
  for missing identity or a failed page. Offline admission is not evaluated identity;
  valid baseline content can still render. Preserve URL intent without claiming
  confirmed identification. Event-bearing XDA forces XPAPI preflight; new profile
  IDs are provisional. Strict hybrid multi-Experience preview still needs client
  reconciliation of multiple preview IDs/results, even with a future toggle, or
  server finalization that breaks the server-preview/client-submit contract.
  Sequential fetching, one facade or selecting one profile does not resolve this.
  See [XDA preflight and profile finalization](../../packages/runtime/README.md#xda-preflight-and-profile-finalization);
  do not choose an architecture or invent a shared preflight transaction API.
- Reset must synchronously invalidate app work, replace old attributed DOM, detach
  the pending visitor work, then reset the SDK and start a fresh page/fetch cycle.
  Normal removal finalizes before manual overrides are cleared; register new roots
  only after insertion. Check ownership after awaits and before further fetch/UI work.
- Preserve EJS/DOM registration, named-slot, prop and real attribution parity. Keep
  client partial content with generic diagnostic counts; never dump the strings.
  Custom track is separate from XDA and its admission label does not promise delivery.
- index.ejs owns both SSR markup and native template elements. Reuse its markup
  functions; the client clones native templates and never compiles/renders EJS.
- Match the Web reference theme, main-pane Utilities and split content layout.
- Keep the event-attempt sidebar optional and browser-owned: subscribe before
  hydration, retain it across routes, and dispose its subscription/age timer on
  final exit or failed activation. Preserve it for BFCache. Never fabricate server
  events or expose handoff/profile payloads. Group only actual interval IDs.
- No tests, test infrastructure, mocks, fixtures, simulated upstreams, verification
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

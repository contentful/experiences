# Web SDK reference implementation

Official support is one Experience fetch per page, without code enforcement.
Reference multi-ID loops exist only to compare rendering scenarios, not as
supported product usage or a cross-fetch guarantee.

- Read `README.md` and parent implementation guidance before changing this app.
  Use automatic setup through rendered plan containers.
- Keep the application outside root workspaces and consume installed local SDK
  tarballs. Use the existing install helper and explicit Nx/npm targets. Refresh
  setup/install after SDK artifacts change; do not add workspace source aliases.
- Follow the pinned Optimization reference's compatible structure and visual
  patterns while retaining Experiences npm/Nx, Vite asset tooling, ESLint,
  Prettier and scoped PM2 commands. Do not replace the Web Rslib/UMD tooling.
- Browser application files may be vanilla JavaScript. Lint them separately from
  TypeScript server/build scripts; do not claim typecheck validates browser
  property accesses. Do not add handwritten content schemas or custom generators.
- Keep fixed UI markup in native HTML templates; fill CMS/event values through
  text APIs and leave Rich Text conversion to the Contentful renderer.
- Preserve `.env`; initial authorized values may come from the Node reference's
  local file. Runtime reads only this app's file. Inject only the explicit public
  allowlist with HTML-safe JSON. CDA_TOKEN is intentionally browser-visible;
  management credentials, server-only preview tokens and unrelated environment settings must never be
  copied, logged, served or built into assets.
- Keep Node HTTP/dotenv and a public-only file server with proper missing-asset
  errors, extensionless SPA fallback, loopback binding and API-free `/health`.
  Delivery goes directly from browser to default live services; no proxy or
  simulated upstream. CORS OPTIONS is not Experience API noncommitting preflight.
- Copy only the installed Web UMD/map; bundle Rich Text and the public pure tracking
  helper separately; optional preview uses a separately bundled installed ESM artifact. Refresh setup after SDK changes to avoid stale installed UMDs.
  `public/dist` is generated; the vendored theme is authored local source with
  pinned provenance. No adjacent Optimization checkout/package runtime dependency.
- Runtime-backed Preview Sessions use conditional `livePreview`, normal fetch/render,
  then `subscribeToPreview` for updates and `states.preview` for status. No
  application-owned preview clients, socket/retry code, Live Updates, mocks,
  fixtures, simulated responses, E2E tests, or E2E infrastructure. Validate using local
  build/lint/typecheck, real artifacts and direct live browser inspection.
- Retain stable selectors and applicable Optimization `data-testid` conventions.
  Preserve the event-attempt labels and real plan attribution. SDK
  state, interceptors, consent, queues and event observations already exist; do not
  reimplement them. Event-stream publication is an attempt, not delivery success.
- Stop only `experiences-web-sdk-app`; preserve unrelated processes. Do not add
  app-owned process-management runners or bespoke validation scripts.
- Keep one SDK instance, SDK-owned profile/consent/persistence, and empty SDK resolver
  registries. Render the two current registration kinds through the app DOM
  registry and actual named slots recursively; do not invent composed hierarchy.
- Follow the [Runtime aggregate contract](../../packages/runtime/README.md#shared-handoff-primitives).
- Supply explicit page/optional initial URL identify intent through ordinary Web
  fetch, accepting existing type-tagged arguments or raw built events with SDK
  construction once. CSR needs no handoff or direct initial event prerequisite.
  Later comparison IDs and same-ID Retry use ordinary event-free fetch without
  builders, hooks or replay; incoming replay delivery retry remains queue-owned.
- Standalone Identify and CUSTOM TRACK use fresh nonpage intent through ordinary
  fetch, with no local handoff or commit. Navigation still carries page intent.
  Preserve URL intent without repeating initial identify; blocked nonpage events
  do not replay automatically on consent grant.
- Retain accepted aggregate replay identity across newer initialization within the
  owner lifetime; serialized A after B is refused for page/nonpage intent without
  state/event republication, recommit or fallback. New visitors/actions need fresh
  message IDs. Reset/destroy clear this history; consent withdrawal does not restore
  accepted/blocked intent on grant.
- Reset removes old attributed DOM, invalidates route/identify ownership and
  detaches old visitor work before SDK reset and a fresh page/fetch cycle. Check
  ownership after awaits and before further fetch, admission or UI work. Keep per-ID
  content errors separate from event outcomes; refusal does not block valid content.
- Consent subscriptions update Utilities only and remain caller-owned. No profile
  subscription refreshes content. XDA always forces Personalization API preflight; local adoption,
  storage, admission and generic SDK success do not commit provisional profiles.
  Keep consent context and the default Web browser provider's title/hash/width/height
  metadata. Custom providers/arguments remain caller-owned; add no instance wrappers
  or event sanitizers. Refresh installed SDK artifacts. See
  [XDA preflight and profile finalization](../../packages/runtime/README.md#xda-preflight-and-profile-finalization).
  Personalization API is actual commit transport; retain no standalone Personalization API preparation workflow.
- Automatic tracking uses the existing getTrackingAttributes helper on each plan
  container and each node's roots. Web fetches request source maps automatically
  while any automatic type is enabled. Do not restore application lookup maps,
  namespaces or a tracking-session API, or add a parallel public setup API.
- Use default automatic tracking and viewport view geometry, including scroll-container clipping.
  The SDK discovers boundaries and finalizes removed occurrences; preserve its
  consent/reset guards and multi-root grouping. No app-owned automatic teardown.
- The manual section registers elements through `sdk.tracking.enableElement('views',
element, { data })` after DOM insertion, following Optimization. Use each card's
  innermost real scope; there are no Record view/click controls or automatic scope
  attributes. Release explicit registrations after DOM removal when replacing
  content. The SDK owns measurement and consent; do not add app observers.
  Page Two's CUSTOM TRACK action supplies literal nonpage track arguments through ordinary Web fetch. Navigation still carries a page; evaluation does not prove commitment.
- Subscribe to eventStream before initial page and retain that one sidebar
  subscription across routes. Count every actual notification, including repeated message IDs,
  and group only actual view/hover interval IDs. Keep event text safe and dispose
  caller-owned subscription/age timer before destroying the SDK.

- Optional preview uses the README configuration and explicitly allowlisted browser
  settings. Build and host read app-local `LIVE_PREVIEW_ENABLED`; disabled
  deployments exclude the optional package. Preview requires the flag to be exactly
  `true` and a nonempty trimmed URL `preview_session_id`. Pass explicit
  `isPreview: Boolean(previewBinding)` even when false; disabled flags never suppress
  ordinary events. `LIVE_PREVIEW_SESSION_ID` is local convenience storage only;
  never read it in runtime/build code or emit it in browser configuration. Branch visitor work on
  `sdk.isPreview`; release content subscriptions on route replacement/final exit,
  retaining them for BFCache. Use `replaceLivePreview` for binding changes within
  preview and reload the document when entering or leaving preview.

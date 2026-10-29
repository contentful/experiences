# Web SDK reference implementation

- Read `README.md` and parent implementation guidance before changing this app.
  Use automatic setup through rendered plan containers.
- Keep the application outside root workspaces and consume installed local SDK
  tarballs. Use the existing install helper and explicit Nx/npm targets. Refresh
  setup/install after SDK artifacts change; do not add workspace source aliases.
- Follow the pinned Optimization reference's compatible structure and visual
  patterns while retaining Experiences npm/Nx, Vite asset tooling, ESLint,
  Prettier and scoped PM2 commands. Do not replace accepted Web Rslib/UMD tooling.
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
- Submit one ordinary `sdk.identify` for explicit Identify or initial URL intent;
  await its terminal completion before dependent content and the initial page.
  Explicit Identify joins an already pending page. Keep normal initial/navigation
  page ownership and terminal sequencing. URL `?userId=charles` is intent only;
  preserving it across routes does not request another identify. Reset removes old
  attributed DOM, invalidates page/identify owners and detaches the pending visitor chain,
  then resets SDK state synchronously before fresh discovery and page/fetch work.
- Content Retry retries content without another page or identify. Missing profiles,
  event refusal/rejection and offline admission must not block valid baseline content.
  Distinct configured IDs have independent plan results and load concurrently after
  pending visitor actions settle; reuse each plan for repeated presentations. SDK
  revision/lifecycle guards own response profile effects; retain stale-action guards.
- Consent subscriptions update Utilities only and remain caller-owned. No profile
  subscription may refresh content. Do not equate event admission, an event attempt,
  profile presence or HTTP 200 with evaluated identity or personalized success.
  Keep per-ID content errors separate from event outcomes. Event-bearing XDA forces
  XPAPI preflight; new IDs remain provisional despite current SDK auto-adoption.
  This reference uses ordinary committing XPAPI events before profile-only content.
  See [XDA preflight and profile finalization](../../packages/runtime/README.md#xda-preflight-and-profile-finalization).
  Actual Personalization preflight stays supported.
- Automatic tracking uses the existing getTrackingAttributes helper on each plan
  container and each node's roots. Web fetches request source maps automatically
  while any automatic type is enabled. Do not restore application lookup maps,
  namespaces or the removed session API, or add a parallel public setup API.
- Use default automatic tracking and viewport view geometry, including scroll-container clipping.
  The SDK discovers boundaries and finalizes removed occurrences; preserve its
  consent/reset guards and multi-root grouping. No app-owned automatic teardown.
- The manual section registers elements through `sdk.tracking.enableElement('views',
element, { data })` after DOM insertion, following Optimization. Use each card's
  innermost real scope; there are no Record view/click controls or automatic scope
  attributes. Release explicit registrations after DOM removal when replacing
  content. The SDK owns measurement and consent; do not add app observers.
  Page Two's separate custom action uses `sdk.track`. An attempt is not delivery success.
- Subscribe to eventStream before initial page and retain that one sidebar
  subscription across routes. Count every actual notification, including repeated message IDs,
  and group only actual view/hover interval IDs. Keep event text safe and dispose
  caller-owned subscription/age timer before destroying the SDK.

- Optional preview uses the README configuration and explicitly allowlisted browser
  settings. Build and host read app-local `LIVE_PREVIEW_ENABLED`; disabled
  deployments exclude the optional package. Branch visitor work on
  `sdk.isPreview`; release content subscriptions on route replacement/final exit,
  retaining them for BFCache. Use `replaceLivePreview` for binding changes within
  preview and reload the document when entering or leaving preview.

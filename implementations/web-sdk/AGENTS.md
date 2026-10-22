# Web SDK reference implementation

- Read `README.md`, parent implementation guidance, and the checkout-local
  `tmp/web-sdk-reference-implementation-plan.md` before changing this app. Respect
  explicit phase authorization and stop for user acceptance at each boundary.
  Phases 1–6 are accepted. Phase 7 covers integrated verification and final
  documentation; stop for final acceptance before publishing or further work.
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
  management/preview tokens and unrelated environment settings must never be
  copied, logged, served or built into assets.
- Keep Node HTTP/dotenv and a public-only file server with proper missing-asset
  errors, extensionless SPA fallback, loopback binding and API-free `/health`.
  Delivery goes directly from browser to default live services; no proxy or
  simulated upstream. CORS OPTIONS is not Experience API noncommitting preflight.
- Build assets from the installed Web dist and the Contentful Rich Text renderer.
  `public/dist` is generated; the vendored theme is authored local source with
  pinned provenance. No adjacent Optimization checkout/package runtime dependency.
- No Live Updates, Live Preview, preview controls/assets, mocks, fixtures,
  simulated responses, E2E tests, or E2E infrastructure. Validate using local
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
- Follow README/D5: await page on navigation, build one identify per explicit
  content cycle and embed it in each distinct sequential fetch, never send identify
  independently. URL `?userId=charles` is intent only. Reset clears that intent and
  SDK state, then page/fetches again. No profile subscription may refresh content.
- Retain current XDA workaround comments/removal criteria and stale-action guards.
  Consent subscriptions update Utilities only and remain caller-owned. Show
  initialization failure when admission produces no profile; do not equate event
  admission, an event attempt, or HTTP 200 with delivered/personalized success.
- Request source maps in existing content fetches. Stamp only scope roots in the
  automatic section with the public tracking helper; namespace opaque keys per
  rendered plan and retain shared keys within multi-root occurrences. Keep plans
  unchanged. Never automatically stamp the manual section.
- Start one SDK interaction session with the actual scrolling `.app-main` view
  root. Await stop before replacing tracked DOM, retaining its lookup through final
  events. Let reset/consent use the SDK lifecycle; do not reimplement detectors.
- Manual view/click and Page Two custom actions use public event methods and real
  attribution. Views use a fresh interval ID and duration zero; never fabricate
  hover duration or entity IDs. Admission/completion is not delivery success.
- Subscribe to eventStream before initial page and retain that one sidebar
  subscription across routes. Count notifications, including repeated XDA messages,
  and group only actual view/hover interval IDs. Keep event text safe and dispose
  caller-owned subscription/age timer before destroying the SDK.

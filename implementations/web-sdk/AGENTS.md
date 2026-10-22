# Web SDK reference implementation

- Read `README.md`, parent implementation guidance, and the checkout-local
  `tmp/web-sdk-reference-implementation-plan.md` before changing this app. Respect
  explicit phase authorization and stop for user acceptance at each boundary.
  Phase 5 adds content rendering and explicit visitor actions. Interaction tracking
  and the event sidebar remain Phase 6 work and require separate authorization.
- Keep the application outside root workspaces and consume installed local SDK
  tarballs. Use the existing install helper and explicit Nx/npm targets. Refresh
  setup/install after SDK artifacts change; do not add workspace source aliases.
- Follow the pinned Optimization reference's compatible structure and visual
  patterns while retaining Experiences npm/Nx, Vite asset tooling, ESLint,
  Prettier and scoped PM2 commands. Do not replace accepted Web Rslib/UMD tooling.
- Browser application files may be vanilla JavaScript. Lint them separately from
  TypeScript server/build scripts; do not claim typecheck validates browser
  property accesses. Do not add handwritten content schemas or custom generators.
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
  Keep interaction event placeholders inert until Phase 6 is authorized. SDK
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

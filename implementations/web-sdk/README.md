# Experiences Web SDK reference implementation

**Current Phase 6 correction:** Complete and explicitly accepted on 2026-11-02; current checks and acceptance review are recorded in the implementation plan. Phase 7 is complete and explicitly accepted on 2026-11-02, including its API refinements and simplification. Phases 8–13 have not started; the Phase 6 gate is satisfied. Earlier remedy checks and no-production-findings review are historical evidence for a superseded design; no new live-service validation is claimed.

This standalone application consumes the locally packed `@contentful/experiences-web`
SDK as a classic UMD script. Browser application files are vanilla JavaScript;
the HTTP server and asset builder use TypeScript. The app lives outside the root
npm workspaces and declares its own dependencies and tools.

Home and Page Two render live Experience plans through one Web SDK instance.
Utilities provides Grant/Revoke consent, Identify, and Reset. Navigation supports
direct URLs and back/forward. The Tracking sidebar observes SDK event attempts;
automatic discovery and manual element registration use the public SDK tracking API.

Code comments distinguish **Consumer integration** responsibilities (conditional where a
feature is optional), **Reference app** demonstration choices, and **Maintainer**
diagnostics/verification support.
The sidebar, utility buttons, selectors, sample routes and local artifact workflow
are not prerequisites for a consumer integration. The calls they demonstrate use
the real public SDK; consumers provide their own UI, hosting and build tooling.

## Content and visitor actions

Initial load and navigation supply explicit page and optional initial URL identify
arguments to ordinary `sdk.fetchExperience`; the SDK builds admitted arguments
once and accepts raw built events. CSR requires no handoff or direct identify/page
prerequisite. XDA evaluates without committing; this service bug is tolerated
pending upstream force-commit support, without a current force flag or SDK workaround.
Web optionally consumes actual server handoffs in integrations that supply them;
this CSR reference generates none. Event failures remain separate from content
errors and do not hide usable plans.

Home uses a lightweight best-effort loop over distinct configured IDs solely to
compare rendering scenarios, with no SDK multi-Experience or cross-fetch guarantee.
Later IDs use ordinary event-free fetch. Its manually
observed section reuses the first plan. Page Two fetches the last configured
Experience for the automatic section and the first for the manual section. If
these IDs coincide, it fetches once and renders both presentations. There is no
cross-cycle content cache. Actual named slots render recursively with nested-card
styles; flattened composed nodes remain siblings. `title` and `text` use DOM text
APIs, and `richText.document` uses Contentful's HTML renderer. The DOM renderer
registry handles `codedComponent` and `codedExperienceTemplate`; the SDK receives
empty resolver registries, matching the current content bindings.

Slot children use a teal accent and a `Slot: <name>` badge, derived from the public
plan's `node.slots` map, which preserves XDA's named slot structure. Root cards keep
the purple accent. This identifies only slots present in the delivered tree;
flattened composed nodes are not assigned an inferred slot or hierarchy.

Identify sets `?userId=charles` using `history.replaceState`, supplies identify arguments
with `traits: { identified: true }`, and supplies fresh identify-only intent
through ordinary Web fetch. It adds no page and performs no local replay or commit.
Initial URL intent pairs identify with the initial page. Navigation preserves URL
intent without repeating initial identify; reload reads it as initial
intent. URL intent is not an API-issued profile ID or authentication state, so
Utilities says **Identify requested**, without claiming traits or audience membership.
No full profile is rendered, manually entered or held in an app-owned store.

Reset removes the identify parameter and old attributed DOM, invalidates pending
route/identify ownership, then calls `sdk.reset()` synchronously before fresh
page-event construction and content loading. Grant/Revoke calls `sdk.consent(true/false)`
to change event and persistence consent together. Effective values come from the
SDK observables, with startup defaults left unset so stored decisions are respected.
The SDK permits identify/page by default even without event consent. Consent
subscriptions update only Utilities; they do not fetch or rerender content or send
page events. The SDK owns persistence, cookies, profile IDs, consent filtering,
queues, and transport retries.

Each route/action cycle invalidates older render work. Check ownership after awaits
and before further fetch, event admission or UI publication. Already submitted events
and requests are not undone; stale completion cannot replace the route. Reset detaches
old visitor work so it cannot delay the next visitor; SDK guards pending responses.
Web retains accepted replay identity across newer initialization within the owner
lifetime. After A is admitted and B becomes current, a serialized A is refused for
both page and nonpage batches, without reapplying state, republishing events,
recommitting or starting page fallback. Calls joining current A share its owned work.
New visitor/action intent must carry fresh message IDs. Reset/destroy clear owner
admission history; event-consent withdrawal purges permitted queued work without
forgetting accepted replay identity or restoring accepted/blocked intent on grant.
This admission guard provides no durable or exactly-once transport guarantee.

Identify adds no page. Content Retry/ordinary refresh refetches the same ID using
ordinary fetch without events, builders, event hooks, publication, admission or
replay. Incoming accepted replay delivery retry remains queue-owned in integrations
that supply a server handoff. Blocked nonpage events do not replay automatically on
consent grant. Loading, empty plans, not-found errors,
and other fetch/render
failures are separate states. Each Experience presentation shows its own loading
or error feedback, tied to fetch/render completion rather than the SDK's
Personalization request-state observable. There is no separate readiness example:
Optimization's producer-hidden Web Component demonstration has no corresponding
custom-element contract in this vanilla DOM renderer. No persistent success banner
is shown; a route-wide panel appears only for errors that need a retry. App-owned consent
subscriptions are disposed before SDK destruction on final page exit; a back/forward
cache suspension preserves the instance for resumption.

## Optional runtime Live Preview

Configure the existing local `.env` and run `npm run dev` after setup:

```dotenv
LIVE_PREVIEW_ENABLED=true
BROWSER_PREVIEW_TOKEN=<preview token approved for browser exposure>
# BROWSER_PREVIEW_HOST=https://...  # optional browser snapshot endpoint
# LIVE_PREVIEW_SESSION_HOST=wss://... # optional socket endpoint
```

Use `?preview_session_id=<session>` and optional `preview_experience_id` (any
Experience ID, default: first presentation ID), or configure
`LIVE_PREVIEW_SESSION_ID` / `LIVE_PREVIEW_EXPERIENCE_ID`. Optional
`LIVE_PREVIEW_RESOURCE_RESOLUTION` is forwarded. Other IDs use Delivery.
Web passes `livePreview` at initialization and uses `fetchExperience()` for initial
content and Retry. After loading/rendering, `subscribeToPreview()` applies new
plans/errors; `states.preview` exposes connection status.
Preview skips visitor actions and disables Identify. Navigation inherits
the current binding only when the destination omits it; explicit destination
preview parameters take precedence. Binding changes within preview use
`replaceLivePreview`; entering or leaving preview reloads the document to create
a new SDK owner. An explicit empty `preview_session_id` leaves preview, including
when a default session is configured. The presentation ID list stays unchanged.
Ordinary `build`, `dev`, `serve`, and `restart` commands read app-local
`LIVE_PREVIEW_ENABLED`: `true` includes optional preview assets and enables host
configuration; other values exclude them. Rebuild after changing this deployment
setting. Only explicit browser preview settings enter HTML. Preview errors retain
usable content, replace failed loading placeholders, and offer Retry content;
successful updates clear recovered errors. Initial plans with diagnostics retain
usable content and show a generic error.
See [Runtime preview limits](../../packages/runtime/README.md#shared-limitations).

## XDA contract and validation

XDA selects content by evaluating embedded built events and the SDK-owned profile
ID. The application-owned best-effort loop uses SDK-owned evaluation outcomes,
reusing plans. Official support is one Experience fetch per page. The SDK does not enforce this
limit in code. Reference implementations fetch multiple IDs only to compare
rendering scenarios; their loops are not a supported product pattern and provide
no multi-Experience or cross-fetch guarantee.

XDA forces XPAPI `preflight: true`, without an override, committing neither events
nor profile creation/changes. Returned new IDs are provisional; SDK adoption,
LocalStorage and cookies do not finalize them. This CSR reference uses ordinary Web
fetch and creates no handoff or compensating commit. XDA noncommit remains a tolerated
service bug awaiting upstream force-commit support, without a current flag or SDK
workaround. Optional actual server replay rules remain in Runtime for integrations
that explicitly supply a handoff.
Standalone direct actions and Personalization preflight remain supported.
See [XDA preflight and profile finalization](../../packages/runtime/README.md#xda-preflight-and-profile-finalization).

The default Web page provider omits `title`, `hash`, `width` and `height` under the
[SDK workaround comment](../../packages/web/src/browser-event-context.ts); the builder preserves
those page-context omissions while retaining the required `properties.title` string. Refresh installed SDK artifacts to use this behavior; application
code adds no event stripping.

HTTP 200 and a returned profile ID alone do not prove personalization. Plans do
not expose all raw XDA errors. Keep direct API diagnosis outside application
runtime; do not intercept or rewrite responses, silently retry content fetches,
or simulate successful selection. The coded and composed Experiences should
change their personalized fragment from baseline to variant content; the third
Experience's identified variant reverses Content 1 and Content 2. Compare actual
rendered content when checking these paths. Live confirmation of the cleaned flow
must use refreshed installed SDK artifacts; source changes alone are not evidence
of service behavior.

## Interaction tracking and event attempts

The SDK requests source-map attribution in existing content fetches while an
automatic interaction type is enabled; there is no initialization content fetch.
The renderer calls the existing `getTrackingAttributes` helper once on each plan
container and on each node's actual scope roots. The container carries attribution;
node attributes contain opaque local keys. Only event attribution fields are
serialized; duplicate scope keys and unrelated caller fields are excluded. The
SDK encodes slot names when generating keys so whitespace cannot split a DOM token. DOM container identity separates repeated
plans, while shared keys within one container preserve multi-root occurrences.
Plans are unchanged. The former lookup, namespace and tracking-session API are
removed rather than retained alongside another setup API.

The SDK discovers these attributes automatically with tracking enabled by default.
Views use the default viewport root, which accounts for scroll-container clipping.
Views apply to Experiences and Fragments; hover/click applies to
Fragments. Fragment roots opt into card clicks with the public clickable attribute.
Dwell, interval IDs, durations, consent and retries remain SDK-owned. DOM removal
finishes qualified intervals without stopping unrelated occurrences. Reset discards
measurements; later page/consent synchronization resumes fresh intervals. Consent
changes do not refetch content.

The manually observed section has no automatic tracking attributes or event buttons.
After rendering, application code calls `sdk.tracking.clearElement('views', element)`
and `sdk.tracking.enableElement('views', element, { data })`, following Optimization's
manual registration example. Each card uses its innermost delivered scope as the
single explicit target. Automatic tracking retains all root keys and groups shared
multi-root occurrences; manual registration follows the API's per-element behavior.
The SDK measures actual visibility, dwell and duration and applies consent and lifecycle
rules for both presentations. On route replacement the app releases its explicit
manual registrations after DOM removal; automatic tracking needs no teardown.
No app-owned observer or fabricated zero-duration view
is involved. Page Two's separate Record custom action calls
literal track arguments for `reference_custom_action` and supplies that intent to
ordinary Web fetch as nonpage intent. It creates no local handoff or commit; navigation to Page Two still carries a page.

The Tracking pill now counts every non-undefined notification from the public
`states.eventStream`, including ordinary identify and page events. These are attempts:
ordinary notifications can precede queue capacity refusal, and neither observation
nor admission confirms HTTP delivery. Blocked calls do not enter this counter;
transport completion/retries do not add notifications. Separate notifications
are counted separately even when they carry the same message ID.

View/hover duration updates share a table row only when their interval IDs match,
so the attempt count can exceed the row count. Other events keep distinct rows.
The table uses text APIs for event-derived values and displays entity kind/ID,
duration and age. Rows persist across navigation and reset, following the pinned
Optimization reference; an undefined reset notification adds no row. The app owns
one subscription and one age timer and disposes both on document unload. The SDK
owns its final hide/unload flush; explicit destruction is for replacing an SDK
inside a live document.
No extra event stream, interceptor demo, transport observer, queue, or timing
implementation is added.

## Setup and local commands

Use Node >=22.13.0 and the root dependencies installed with `npm ci`.
From the repository root:

```sh
npx nx run implementation-web-sdk:setup
npx nx run implementation-web-sdk:dev
```

Setup builds and packs Web and its local dependency chain and packs the existing optional preview
artifact through `package-tools:pack-preview` and the maintained
Nx targets, installs this app with `scripts/install-implementation.ts`, then builds
browser assets. The helper replaces only this app's `node_modules`, disables
workspace participation, install lifecycle scripts, and package-lock generation,
and creates `.env` from `.env.example` only when missing. Existing `.env` values
survive setup, installation, and asset cleanup. Populate the local file before
starting the server.

After SDK source changes, run setup again to rebuild/repack and refresh installed
artifacts, or use root `npm run implementation:install` to refresh all references.
Stop running apps with their scoped `serve:stop` targets before refreshing
dependencies, then relaunch with `serve` or `dev`. `build` alone uses the already
installed artifacts and does not install:

```sh
npx nx run implementation-web-sdk:install
npx nx run implementation-web-sdk:build
npx nx run implementation-web-sdk:typecheck
npx nx run implementation-web-sdk:lint
npx nx run implementation-web-sdk:clean
```

`install` refreshes dependencies after packing; `setup` also builds assets. `clean`
removes only generated `public/dist` and coverage. Root aggregate checks exclude
implementations; use the explicit targets above. App-directory `npm run` commands
also work and resolve locally installed tools. Direct third-party dependencies
are pinned; registry transitive dependencies resolve on each install, following
the existing implementation workflow without a committed app lockfile.

The default URL is `http://localhost:3200/`, with Page Two at `/page-two` and health
at `/health`. Both foreground and background launches read the same app-local
`.env`; `PORT` comes from that file, defaulting to 3200. The server binds to
`127.0.0.1`. Health returns local process status and makes no upstream requests.

```sh
npx nx run implementation-web-sdk:serve
npx nx run implementation-web-sdk:status
npx nx run implementation-web-sdk:logs -- --lines 20 --nostream
npx nx run implementation-web-sdk:restart
npx nx run implementation-web-sdk:serve:stop
```

PM2 manages only `experiences-web-sdk-app` through the local tsx CLI. Stop deletes
that named process and reports an error if absent. Run one checkout with that
name at a time. Avoid global PM2 stop/delete commands when managing this app.
`dev`, `serve`, and `restart` build browser assets from installed packages before
launching; a failed build prevents restart. They do not refresh SDK dependencies.

## Environment and direct browser delivery

Configure `SPACE_ID`, `ENVIRONMENT_ID`, `CDA_TOKEN`, optional `LOCALE` (default
`en-US`), optional comma-separated `EXPERIENCE_IDS`, and `PORT`. Blank or absent
`EXPERIENCE_IDS` uses the shared reference defaults:

- `3fLAdFb3BYAuImRhcW8k4t` — Coded Experience
- `4WzbgzPQHa9Tr2ffbOU8p7` — Composed Experience
- `7u2eP09B4BIBToH8UwSHck` — Personalized Composed Experience

During initial local setup, authorized delivery values may be copied from the
Node reference's `.env`. Preserve an existing Web `.env`; never copy management
or server-only preview credentials. Launch commands read only this app's configuration.

The server parses `.env` with dotenv, falling back to the credential-free
`.env.example`, and fails with a setting name when required values are missing.
Its ordinary projection injects exactly `SPACE_ID`, `ENVIRONMENT_ID`, `CDA_TOKEN`, `LOCALE`, and resolved
`EXPERIENCE_IDS` as `window.ENVIRONMENT` into private/no-store HTML. JSON escapes
`<` before insertion into the script element. No environment values are baked
into source or generated assets. Environment files are ignored by Git and cannot
be served by the public-file server.

`CDA_TOKEN` is intentionally browser-visible. Use a delivery credential scoped for
that use with an appropriate endpoint CORS policy. The accepted transport is
direct browser delivery using the SDK's default live endpoints and
`delivery: { accessToken: window.ENVIRONMENT.CDA_TOKEN }`, with the injected space,
environment and locale. There is no delivery proxy, alternate endpoint selector,
or server-side SDK. Browser HTTP CORS preflight is separate from the Experience
Delivery API's forced XPAPI preflight for event-bearing requests and the supported
Personalization API preflight. This app evaluates events through ordinary Web XDA fetch; those events remain
uncommitted pending upstream service support. It has no Node server handoff.

## Files, assets, and source provenance

- `server.ts`: lightweight Node HTTP server, public-only files, MIME types, GET/HEAD,
  API-free health, safe configuration injection, extensionless SPA fallback.
  Missing assets return 404; dot paths, traversal and public symlinks escaping
  the public directory are rejected. Other methods return 405.
- `scripts/build-assets.ts`: delegates to the repository's shared
  `scripts/build-browser-implementation-assets.mts` using this app's Vite and dotenv.
  It cleans `public/dist`, copies only the installed Web
  UMD and its source map, then uses Vite's library
  build to create `rich-text.js` from `scripts/rich-text.ts` with
  `emptyOutDir: false`. `public/js/experiences.js` imports the generated module
  and renders live Rich Text documents. The same tiny ES module also exports the
  installed SDK's pure tracking-attribute helper and clickable constant; the UMD
  constructor distribution is unchanged.
- `scripts/preview.ts`: app-local optional-package entry; binding parsing and preview
  configuration construction live in the shared `scripts/implementation-preview.mts`.
- `public/index.html` and `public/js/app.js`: common shell, route headers and shared
  content layout. Native templates also supply cards, event rows
  and status messages; `templates.js` clones their markup while the rendering
  modules fill dynamic text and wire actions.
  Stable navigation, utility, and sidebar `data-testid` conventions follow the
  Optimization reference. Experience-specific placeholders replace entry/Web
  Component semantics. `app.js` separates route orchestration, shell/control setup,
  visitor intent, sequential XDA evaluation, independent event admission and
  presentation insertion into focused functions.
  `control-panel.js` owns utility display and consent subscription cleanup;
  `experiences.js` owns DOM plan rendering and exposes manual
  roots for registration after insertion; `tracking.js` owns the observable sidebar
  and its cleanup.
- `public/css/theme.css`: locally vendored Optimization theme from commit
  `59add9d6ebff503b9033a59a2eee0149d4b4e925`, `lib/e2e-web/src/theme.css` (MIT).
  This is stylesheet provenance, not a dependency on its testing package.
  Excluded feature styles are removed. A small narrow-screen rule stacks the
  sidebar above the scrollable main area because the reference's fixed 340px
  sidebar leaves insufficient phone-width content space.

Server, template navigation and installed-asset preparation patterns also derive
from that commit's `implementations/web-sdk`. npm/Nx, scoped PM2, ESLint, Prettier,
local tarball overrides and the shared installer follow Experiences tooling.
Vite bundles Rich Text and the pure public tracking helper; Web's accepted Rslib distribution
is consumed unchanged. No adjacent checkout is needed to build or run this app.

### Retained differences from Optimization

- Experiences renders XDA plans through application-owned DOM renderers rather
  than Optimization's entry Web Components. There is no producer-hidden readiness
  example; loading/errors belong to the actual rendered content. The manual copy
  demonstrates explicit element registration alongside automatic discovery, using
  the same SDK-owned measurement and consent mechanisms as Optimization.
- XDA selects variants server-side from embedded built events during preflight.
  Content refresh is explicit; there is no profile-driven ordinary content refresh, Optimization
  Live Updates or Preview Panel.
  Attribution comes from source maps and is stamped once per rendered plan container,
  adapting Optimization's self-describing entry hosts to multi-root scopes. Event
  labels use Experience/ExperienceFragment semantics.
- npm/Nx, ESLint/Prettier, scoped PM2 and local tarball installation retain this
  repository's maintained tooling. Vite prepares Rich Text/pure-helper assets;
  the installed SDK keeps its accepted Rslib distribution. The theme is vendored
  locally, and a narrow-screen layout stacks sidebar/content for usable phone widths.

## Validation and scope

Use build, local lint/typecheck, actual artifact inspection and direct browser
checks. TypeScript checks `server.ts` and `scripts/**/*.ts` only. Browser JavaScript
is linted; TypeScript does not validate its content property accesses or live
binding shapes. No handwritten content-type substitute or custom generator is
included.

Operation and verification use live services only. Do not introduce mocks,
fixtures, simulated upstreams, E2E tests, or E2E infrastructure. Retain stable
selectors for compatibility. Optimization Live Updates is outside this reference; Preview Sessions use the optional runtime integration above.
An event-stream notification denotes an event attempt, not admission or
successful delivery. HTTP 200 alone does not prove personalization; compare the
actual selected content and report service failures without compensating retries.

Live verification has not reached empty-plan, missing-Experience, transport-failure
or content loading after queued page admission without a profile, offline/capacity
refusal, retry, SDK pending-response
isolation, subscriber-exception, or back/forward-cache suspension scenarios.
Local SDK unit tests and source review cover those branches where applicable;
they do not establish live service outcomes. Ordinary browser back navigation
does not establish back/forward-cache behavior. Visual comparison uses the pinned
Optimization source/theme rather than a running pixel comparison.

Automatic setup through rendered plan containers is the current standard.

## Troubleshooting

- Missing/outdated assets: run setup after SDK changes, or build after app asset changes.
- Missing settings: populate this app's ignored `.env`; do not edit `.env.example`
  with credentials.
- Port conflict: choose a different local `PORT`, without stopping another app.
- A standalone copy must preserve relative `implementations/web-sdk` and `pkgs`
  locations. Install with `npm install --workspaces=false --package-lock=false
--ignore-scripts` there, then use local npm commands; no root tool is needed to
  build/check/run an already configured copy.

# Experiences React SDK runtime reference

Official support is one Experience fetch per page, without code enforcement.
Reference multi-ID loops exist only to compare rendering scenarios, not as
supported product usage or a cross-fetch guarantee.

**Current Phase 6 correction:** Complete and explicitly accepted on 2026-11-02;
current checks and acceptance review are recorded in the implementation plan.
Phase 7 is complete and explicitly accepted on 2026-11-02, including its API refinements and simplification.
Phases 8–13 have not started; the Phase 6 gate is satisfied. Earlier remedy
checks/review remain historical; Phase 7 package and live observations are recorded
in its implementation-plan entry.

This private standalone React/Vite application loads and renders real Experience
plans. It consumes locally packed SDK artifacts outside the
root npm workspaces.
Home (`/`) and Page Two (`/page-two`) support direct document visits, client
navigation through ordinary links and browser back/forward under one stable root. The Web reference's theme, Tracking sidebar,
Utilities area and split content layout provide automatic and manual tracking
presentations with SDK-owned consent controls.

The first route ID loads through the registry-bound `useManagedExperience` hook;
supplied renderer presentations reuse that hook's plan
for automatic and manual roots. Later comparison IDs seed managed `Experience`
presentations so they can receive live-preview updates. The first request carries
page/optional initial URL identify intent through ordinary Web fetch. Later IDs use a lightweight
event-free comparison loop and reuse their plans. Application-owned free fetching
and supplied-plan rendering remain supported public paths. `ExperiencesRoot`
activates one Web runtime after React commits, retaining it through navigation.
Utilities expose consent, Identify, Reset, Retry content and Page Two's separate
CUSTOM TRACK; the sidebar reports actual event-attempt notifications. Optional
Preview Sessions use the same SDK loading and rendering surfaces. Credentials are
unnecessary to build and start; real content requires app-local browser-approved
Delivery configuration. Phase 6 corrects the
existing Node/Web/hybrid references and owner checks, plus the necessary React
provider/root migration to `handoff?: ExperiencesHandoff`, replacing
`initialization: { routeKey, handoff }` and `ExperiencesStateInitialization`.
Lifecycle consumes the complete operation using current browser route. Matching
nonpage replay has no page fallback; replay-less state applies internally and returns
`{ accepted: false }` unless explicit `buildPayload` supplies page intent. Managed React loading uses ordinary Web fetch for CSR and browser-local
navigation/actions; normal fetch requires no handoff.
Optional Web/React handoff consumption is mode agnostic and consumer supplied
only for an actual server transfer, independently of display. No local CSR/
navigation producer remains. Retry is ordinary event-free fetch of the same ID;
accepted incoming replay delivery retry remains queue-owned. Page Two's CUSTOM TRACK
action is nonpage; navigation still carries a page. Preserve pinned ownership,
consent/lifetime and the page consent-retry exception without direct initial
emission as a prerequisite. See the
[implementation plan](../../tmp/react-next-runtime-implementation-plan.md#phase-5-implement-react-ownership-providers-and-hooks)
and [accepted design](../../tmp/react-next-runtime-phase-1-design.md).

The API refinements distinguish supplied `<Experience experience={plan} />`
presentation from managed `experienceId` loading with optional `initialPlan` and
`initialError` seeds.
Supplied presentation performs no content request, resolution or preview binding.
Committed `onExperienceResolved`/`onExperienceError` notifications can report a
usable plan alongside an error; node/function fallbacks and custom children retain
the full result. `isLive` narrows the context SDK for concrete operations, while
root/provider `initialPagePayload` supplies static `PageViewBuilderArgs` with explicit
`buildPagePayload` precedence. See the [adapter contract](../../packages/adapter-react/README.md#managed-content).
Reference reduction and source organization are implemented. Local SDK checks,
installed setup/build/lint/typecheck, bounded review and live reference checks have
passed; Phase 7 is complete and explicitly accepted on 2026-11-02.

## Setup and local commands

Use Node >=22.13.0 and installed root dependencies. From the repository root:

```sh
npx nx run implementation-react-sdk:setup
npx nx run implementation-react-sdk:dev
```

`install` packs React and Web through their maintained Nx targets and packs the
existing optional Preview artifact with `package-tools:pack-preview`. The shared
`scripts/install-implementation.ts` helper installs this app with workspace
participation, install scripts and lockfile generation disabled. It refreshes only
this app's `node_modules` and copies `.env.example` to `.env` only when absent.
`setup` runs `install` and then builds the application. Stop this app before
refreshing dependencies; repeat setup after SDK artifact changes.

Root `npm run implementation:install` prepares every registered reference,
including this app, through `nx run-many -t setup --projects=tag:scope:implementation`.
Use the scoped setup target above when refreshing only React.

```sh
npx nx run implementation-react-sdk:install
npx nx run implementation-react-sdk:build
npx nx run implementation-react-sdk:lint
npx nx run implementation-react-sdk:typecheck
npx nx run implementation-react-sdk:clean
```

`build` uses installed artifacts without installing or packing. `typecheck` checks
browser TSX and Node/tooling separately. `clean` removes only generated `dist` and
coverage; it preserves source assets, dependencies and `.env`. App-directory
`npm run` commands resolve the locally installed tools. Direct third-party versions
are pinned; transitive registry dependencies resolve through the existing
standalone install workflow without an app lockfile. Root aggregate checks exclude
implementation projects; use these explicit checks. The Build CI job runs aggregate
reference setup, then explicitly runs
`npx nx run-many -t build,lint,typecheck --projects=tag:scope:implementation`,
including this app.

The default address is `http://localhost:3400/`. Both foreground `dev` and PM2
launches build with Vite and serve the generated shell through the same Node HTTP
host. This follows the Web reference's build-before-start convention; `dev` does
not provide Vite hot reload. The host binds to `127.0.0.1`, serves only `dist`, and
exposes API-free process liveness at `/health`. Extensionless paths receive the
shell, with an unknown-route message for paths other than Home/Page Two. Missing
assets and `/api` return 404, dot paths/traversal are rejected, and only GET/HEAD
are supported. Health makes no service requests and does not establish SDK readiness.

```sh
npx nx run implementation-react-sdk:serve
npx nx run implementation-react-sdk:status
npx nx run implementation-react-sdk:logs -- --lines 20 --nostream
npx nx run implementation-react-sdk:restart
npx nx run implementation-react-sdk:serve:stop
```

PM2 manages only `experiences-react-sdk-app` through this app's local tsx CLI.
Stop deletes that named process and reports an error if absent. Use one checkout
with that process name at a time. `dev`, `serve` and `restart` build before launch;
a failed build prevents restart. Avoid global PM2 stop/delete commands.

## Local configuration

The host parses only this app's `.env`, falling back to the credential-free
`.env.example`. Existing `.env` values survive setup/build/clean. It never reads
another reference's environment file or spreads `process.env`. `PORT` is local
hosting configuration, defaulting to 3400, and must be an integer in 1–65535.

The public allowlist is `SPACE_ID`, `ENVIRONMENT_ID`, `CDA_TOKEN`, `LOCALE`,
resolved `EXPERIENCE_IDS` and the optional `LIVE_PREVIEW` projection described below. The first and third default to empty strings;
environment defaults to `master` and locale to `en-US`. The content loader uses
these values for Delivery requests; the managed root uses the same browser-safe
Delivery configuration and the SDK's default Optimization endpoints.
The host injects them as `window.ENVIRONMENT` in private/no-store HTML, escaping `<` in JSON.
Vite environment loading and automatic environment exposure are disabled. No
configuration values are baked into the JavaScript assets, and environment files
cannot be served from the output-only host.

`CDA_TOKEN`, when configured, is intentionally browser-visible and must be a Delivery
credential approved and scoped for that use. Do not place management credentials
or server-only preview tokens in the public allowlist. Configure optional preview with `LIVE_PREVIEW_ENABLED=true` and an explicitly
browser-approved `BROWSER_PREVIEW_TOKEN`. Optional `BROWSER_PREVIEW_HOST`,
`LIVE_PREVIEW_EXPERIENCE_ID`, `LIVE_PREVIEW_SESSION_ID`, `LIVE_PREVIEW_SESSION_HOST`
and `LIVE_PREVIEW_RESOURCE_RESOLUTION` map to the supported public SDK initializer.
A blank Experience ID uses the first configured/default ID. The URL can override
`preview_session_id` and `preview_experience_id`; an explicitly empty
`?preview_session_id=` selects ordinary mode even when a session default is configured.
Links preserve that explicit choice. Changing session or fixed preview policy
recreates the document/owner; ordinary navigation retains it. Rebuild and restart
after changing the deployment flag: Vite replaces `__LIVE_PREVIEW_ENABLED__` at
build time, excluding the optional preview import/chunk when disabled. Runtime
configuration alone cannot add an excluded chunk. The session token is required;
no tokenless-proxy capability is assumed.

Matching preview requests load the snapshot and bind resolved session updates.
Unrelated IDs retain ordinary fetching under preview's event policy. Utilities
show status/errors, visitor event controls are suppressed, and usable content
survives refresh or connection failures. Explicit Reset and consent controls retain
SDK command semantics. See [Runtime preview limits](../../packages/runtime/README.md#optional-runtime-live-preview);
this reference does not implement protocol recovery or an independent preview client.

An absent or blank comma-separated `EXPERIENCE_IDS` uses the same defaults as Web:

- `3fLAdFb3BYAuImRhcW8k4t` — Coded Experience
- `4WzbgzPQHa9Tr2ffbOU8p7` — Composed Experience
- `7u2eP09B4BIBToH8UwSHck` — Personalized Composed Experience

Local overrides are trimmed and deduplicated while preserving order. IDs are
optional configuration, not rendered content or manually supplied visitor profile
IDs. Home uses all configured IDs in the automatic section and the first in the
manual section; Page Two uses the last automatically and the first manually. The
manual section presents that first plan twice to demonstrate separate DOM roots.

## Package boundaries and source

`package.json` declares the public React and Web local tarballs, overrides their
Client/Runtime/Core/Design chains to local archives, and installs the unchanged
Preview artifact as an optional dependency for deployment-controlled lazy initialization. There
is no Next dependency, workspace source alias or adjacent Optimization dependency.
The browser imports the public React `/client` entry and the maintained Contentful
Rich Text React renderer/types. The React managed root owns Web construction and
disposal; the app imports Web's public state types for optional diagnostics.
Preview is initialized only when the deployment enables it and a session is bound.

Browser rendering uses the public `@contentful/experiences-react/client` entry;
static/server integration uses `@contentful/experiences-react/server` where
applicable. This browser app uses `/client` for managed loading, hooks, supplied
primary-plan rendering and seeded comparison rendering. Preview integration uses
the frozen package's public exports and Runtime's supported initializer; see
[Runtime preview limits](../../packages/runtime/README.md#optional-runtime-live-preview).

- `src/main.tsx`, `index.html`: bootstrap and document/BFCache lifetime; no application components live in the entrypoint.
- `src/App.tsx`: stable SDK root, preview configuration and route selection.
- `src/Navigation.tsx`: navigation UI and one URL/visitor-intent update path, including history and focus.
- `src/PageShell.tsx`: shared layout, sidebar, page heading/title and busy state.
- `src/ContentPage.tsx`: one primary managed result, comparison IDs, repeated presentations and the synchronous content gap before Reset.
- `src/experiences.ts`: pure registry binding shared by the root, renderer and loader; no module-scope SDK construction.
- `src/ConsentControls.tsx`: independent consent controls, Identify/custom visitor intent, Reset, Retry and preview diagnostics. Visitor actions are disabled while the initial content request is pending; there is no application action queue.
- `src/attempt-log.ts`, `src/TrackingLog.tsx`: retained attempt subscription, measured interval grouping and sidebar age timer.
- `src/content-loader.ts`: the event-free comparison hook/loop and its effect cleanup, without a supported multi-Experience guarantee.
- `src/preview.ts`: optional public module import and URL/environment session binding.
- `src/Content.tsx`: plain card/template components, generated field types, narrow binding checks, Rich Text and the named slot.
- `src/experience-config.tsx`: SDK registrations and Fragment clickability; presentation components remain separate.
- `src/ExperiencePresentation.tsx`: current content, diagnostics, error/empty display, managed comparison seeds and one context-based manual-view registration callback.
- `src/contentful-generated.d.ts`: unchanged copy of the current Node reference's
  generated CDA declaration. Its `contentful` type dependency is declared locally;
  no generator runs during app setup.
- `src/theme.css`: unchanged Web theme plus a provenance note, vendored from
  Optimization commit `59add9d6ebff503b9033a59a2eee0149d4b4e925`,
  `lib/e2e-web/src/theme.css` (MIT), retaining the license and Web's narrow-layout
  adaptations. The testing package is stylesheet provenance only. Local presentation
  styles are appended without replacing the theme.
- `server.ts`, `public-config.ts`: Web reference hosting/safe projection patterns,
  adapted to Vite output and credential-optional startup.
- `vite.config.ts`, TypeScript/ESLint configs, `project.json`: local build/check
  tooling and scoped Nx lifecycle. Generated assets stay inside this app's `dist`.

## Rendering and binding evidence

Managed loading begins after commit and requests source maps for ordinary content,
including manual presentations. Home starts with the first configured ID; Page Two
starts with the last. Later IDs are comparison-only ordinary event-free fetches.
Both manual presentations reuse one plan; Home's first automatic presentation uses
it too. Primary presentations use the supplied renderer: the primary hook owns fetching and
preview updates, without duplicate content state or per-presentation I/O. Comparison
plans/errors seed managed mode after the event-free comparison loop settles, using
`initialPlan`/`initialError` without a duplicate startup fetch. An error-only seed
still binds preview updates, and explicit refresh/retry can recover. Managed
diagnostics, errors and empty-content messages follow the current `children(result)`
value rather than the original seed; primary presentations use the page-owned
result. Errors for one comparison ID do not prevent remaining comparisons. The SDK/hook guards obsolete
results across navigation, request changes and teardown.
Loading, missing configuration, errors, empty plans and content diagnostics remain
visible without fabricated personalization success.

Initial `?userId=charles` pairs identify with page intent. Standalone Identify and
CUSTOM TRACK supply fresh nonpage arguments; SDK construction occurs once.
Navigation carries a page. Retry/refresh refetch the same descriptor without events,
builders, event hooks or replay and keep usable content. Identify and CUSTOM TRACK are disabled while content is idle/loading, then become
available under the existing preview/identity policy; explicit Retry remains
available after the request settles. Consent changes use SDK/root page behavior without application
consent subscriptions that fetch content. Reset synchronously removes old attributed
DOM/manual registrations before calling the bound SDK reset action, then starts a
fresh presentation while retaining the root and sidebar. URL/title/active links and
focus follow direct navigation and back/forward.

Ordinary SSR/CSR XDA events currently remain uncommitted because the service forces
preflight. That is tolerated absent blocking errors, without synthetic XPAPI
compensation. A provisional profile ID and content success do not prove commitment.
Only actual supplied server transfers use optional explicit replay; this CSR reference
creates none. Insights acceptance is observed per request, not assumed from an ID.

The read-only space export at
`lib/mocks/src/contentful/data/space/ctfl-space-data.json` establishes these mappings:

| Registration / binding      | Evidence and final presentation                                                                                                                                                                                                                                                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `codedComponent`            | Data assembly `5yb8t7OHz3FgDoriyuR2Ek` permits `content` entries. Its GraphQL resolver selects `internalTitle`, `text`, and `richText { document: json }`, returning `title`, `text`, and `richText`. Rendered as a card.                                                                                                                                             |
| `codedExperienceTemplate`   | Data assembly `6qkMYKRvKerQnsOX3Hdc2N` has the same source-field aliases/wrapper. The template declares the named `slot`; the coded Experience fills it with coded and personalized fragments.                                                                                                                                                                        |
| Composed component/template | `246bbtx2pFLq7paqNanBXp` and `1xrW5RkILRtGaWxGhtqtE7` delegate to the coded component assembly, then map outputs through TypeRef properties (`cp_r8UEGKwoXF` / `cp_XxhQNVJuDb` and `cp_17S_0fGkrF` / `cp_iFJCJZhqU-`). Their component trees expand into `codedComponent` nodes. The composed template also inserts its `slot`. No app-side tree expansion is needed. |
| Personalization variants    | The fragment switches `content` entries through the same assembly; the personalized composed Experience swaps its two entry parameters. XDA evaluates the supplied visitor intent; a returned plan or HTTP 200 alone does not prove personalized selection.                                                                                                           |

The title/text/document value types derive from
`TypeContentWithoutLinkResolutionResponse['fields']`, rather than schema markers.
The SDK's incoming content remains unknown-valued. Registration `resolveData`
checks strings and the Rich Text document root; rendering repeats these narrow
binding checks because the SDK may render a node after resolver failure. Missing or
malformed values produce field-specific errors rather than asserted content or
invented defaults. Child-node semantics belong to the maintained Rich Text renderer; the reference
does not implement another recursive document validator.
Linked entries/assets are not separately fetched or resolved by this reference;
the maintained Rich Text renderer uses its default handling for those nodes.
Changed admin mappings or different override IDs may require new registrations.
The app never reads the management export at runtime.

Both single-root presentation components forward ordinary HTML attributes and refs
to their article/section through React `forwardRef`, preserving React 18 compatibility.
Their props contain no SDK binding type. The template's actual `slot` is a
`ReactNode[]`; `Omit<HTMLAttributes<HTMLElement>, 'slot'>` avoids the DOM string-slot
collision. Registrations need no `root: { prop }`; named root bindings remain an
optional advanced/multi-root path. The standard renderer owns the Experience
boundary, attribution, named-slot traversal, node refs and detach cleanup; there
are no per-node DOM wrappers or app-owned observers. A small coded-component
registration wrapper uses public `useContentfulComponent()` context to forward
`data-ctfl-clickable` only for Fragment roots, preserving the Web reference's card
clickability while keeping attribution parsing outside the plain card.

The automatic section leaves `trackViews`, `trackHovers` and `trackClicks` undefined
to inherit Web automatic defaults. The manual-view section sets all three to false,
preserving its original all-automatic-off behavior while retaining scope attribution.
This adapts the refs/per-kind pattern from Optimization's
[`ContentEntry.tsx`](https://github.com/contentful/optimization/blob/59add9d6ebff503b9033a59a2eee0149d4b4e925/implementations/react-web-sdk/src/sections/ContentEntry.tsx)
at the historical revision. That example disables only automatic views; this section
also disables hovers and clicks to preserve the existing reference behavior.
The manual presentation obtains `sdk` from `useExperiences()`, registers only
roots with normalized `onNodeRoot` data through
`sdk.tracking.enableElement('views', element, { data })`, and returns
`clearElement('views', element)` cleanup. These registration lines are intentional
consumer lifecycle work. The renderer handles detach and callback replacement,
including snapshot-to-live activation or an injected SDK replacement. The app
has no root map, attribution traversal, measurement observer or SDK prop threading.

## Runtime ownership, consent and diagnostics

`ExperiencesRoot` constructs Web after browser commit and provides the cached
snapshot before activation or after setup failure. Supplied plans remain visible
independently of activation/readiness; Utilities exposes provider errors and
disables consent actions on the snapshot. `isLive` describes runtime activation,
not preview connection or content success. The public root supports optional explicit
state handoff/replay; this CSR reference uses ordinary fetching and route inputs. Root configuration is captured for the mounted owner;
structural changes require deliberate key replacement, while locale is mutable.
An application-owned SDK can instead be injected through `ExperiencesProvider`;
independent providers may share a public `/host` binding. This reference uses one
managed root; shared-root ownership coverage belongs to SDK tests.

Startup consent/profile defaults are unset. State comes from the SDK and its
existing persistence policy, with no application profile or consent store.
Grant/Revoke changes event and persistence consent independently, with no content
fetch or page action from a consent subscription. Event consent gates tracking;
persistence consent gates durable profile continuity. XDA-returned profile IDs are
adopted locally without proving event commitment. Analytics dispatch and attempt notifications require an available
runtime event profile or identity. Granting event consent alone does not make
interaction attempts appear for a fresh visitor without that prerequisite.
A profileless `trackView` can return `{ accepted: true }` with no `eventStream`
notification or network request. The sidebar counts actual notifications, which
do not establish successful transport delivery.
Page/identify/reset/retry and preview content use the managed integration. Ordinary
content remains independent of event submission, identity finalization and socket status.

The user accepted the live ID-only profile/Insights HTTP 400 mismatch as a tolerated
service limitation on 2026-11-02. See [Runtime's canonical record](../../packages/runtime/README.md#xda-preflight-and-profile-finalization).
View/hover/click notifications show measurement/admission, not delivery. Complete
XPAPI profiles produced HTTP 200; fresh XDA ID-only profiles were rejected for
missing profile fields. No profile fields or compensating commits are fabricated.

The stable `onStatesReady` callback attaches the optional sidebar's retained
subscription during activation, before root-driven work. It ignores the immediate
historical `.current` emission on every attachment. Each later event notification
increments the attempt count, even when message IDs repeat. Only real view/hover
interval IDs with durations group into one row; the row shows the latest duration,
first-observed age and notification count. React renders labels as text. These
rows describe attempts after applicable capacity/whole-batch admission and before
transport completion, never delivery
success. Clearing SDK event state does not fabricate an attempt or erase history.
The age timer and UI subscriptions clean up on unmount; the root owns the early
subscription's cleanup.

Web owns interaction completion and its final visibility/hide flush. The host
leaves the mounted owner and attributed roots alive during document exit so that
manual cleanup or SDK destruction cannot cancel pending final durations or the
Beacon attempt. Document teardown releases that document's tree, subscriptions,
timers and SDK. Deliberate React unmount/replacement within a live document instead
uses renderer/provider cleanup to release manual registrations, subscriptions and
the owned SDK. Persisted `pagehide` retains the root, subscriptions and SDK for
BFCache resumption; no new load or runtime is created.

The ownership/consent/sidebar patterns were historically traced with `git show`
at Optimization commit `59add9d6ebff503b9033a59a2eee0149d4b4e925`: React `OptimizationProvider`,
Web `presentation/optimizationRootRuntime.ts`, and the maintained React reference's
`main.tsx`, `ControlPanel.tsx` and `AnalyticsEventDisplay.tsx`. The retained
Experiences differences are supplied XDA plans rather than local CDA variant
resolution, XDA-carried ordinary intent, SDK-normalized attribution data,
and skipping historical notifications when attaching diagnostics. The pinned
reference is historical evidence only, with no adjacent-checkout runtime dependency.
The active parity baseline is PR #549 at
`f76f1ff04df1b466c98fc6ce5db6b569f9212438`, rather than that historical pin.

Use scoped build/lint/typecheck and direct inspection of this maintained app for
validation after refreshing the installed tarballs. Inspect both routes, repeated
roots, the named slot, Rich Text, missing/malformed content, attribution attributes
and per-kind flags. No network unit tests, MSW, E2E tooling, simulated services or
temporary consumers belong to this reference. Build/typecheck establishes artifact
consumption, not live service results. Inspect independent consent decisions,
retained supplied content after activation failure, callback registration cleanup,
attempt counts/grouping and final-exit/BFCache behavior with the installed SDK
artifacts. Keep public imports; no workspace aliases or temporary consumers are
needed to validate this integration boundary.

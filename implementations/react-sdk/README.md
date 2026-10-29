# Experiences React SDK rendering reference

This private standalone React/Vite application loads and renders real Experience
plans. It consumes locally packed SDK artifacts outside the
root npm workspaces.
Home (`/`) and Page Two (`/page-two`) use ordinary document links, including direct
navigation and browser back/forward. The Web reference's theme, Tracking sidebar,
Utilities area and split content layout provide automatic and manual tracking
presentations with SDK-owned consent controls.

The application loads real Experience plans through the public React `/client`
free `fetchExperience` API and renders them with `ExperienceRenderer`. This
application-owned loading/supplied-plan path remains supported when managed
loading arrives. A registry-bound `ExperiencesRoot` activates one Web runtime after
React commits. Utilities expose event and persistence consent; the optional
Tracking sidebar reports actual event-attempt notifications. Credentials are
unnecessary to build and start; content loading requires the app-local space and
browser-approved Delivery token. Managed content/navigation/preview and
page/identify/reset/retry sequences remain Phase 6 work. See the
[implementation plan](../../tmp/react-next-runtime-implementation-plan.md#phase-5-implement-react-ownership-providers-and-hooks)
and [accepted design](../../tmp/react-next-runtime-phase-1-design.md).

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

The complete public allowlist is `SPACE_ID`, `ENVIRONMENT_ID`, `CDA_TOKEN`, `LOCALE`
and resolved `EXPERIENCE_IDS`. The first and third default to empty strings;
environment defaults to `master` and locale to `en-US`. The content loader uses
these values for Delivery requests; the managed root uses the same browser-safe
Delivery configuration and the SDK's default Optimization endpoints.
The host injects them as `window.ENVIRONMENT` in private/no-store HTML, escaping `<` in JSON.
Vite environment loading and automatic environment exposure are disabled. No
configuration values are baked into the JavaScript assets, and environment files
cannot be served from the output-only host.

`CDA_TOKEN`, when configured, is intentionally browser-visible and must be a Delivery
credential approved and scoped for that use. Do not place management credentials
or server-only preview tokens in the public allowlist. Preview configuration and
initialization are introduced with the later preview integration; this app
does not read preview settings or open a connection.

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
Preview artifact as an optional dependency for eventual lazy initialization. There
is no Next dependency, workspace source alias or adjacent Optimization dependency.
The browser imports the public React `/client` entry and the maintained Contentful
Rich Text React renderer/types. The React managed root owns Web construction and
disposal; the app imports Web's public state types for optional diagnostics.
Preview remains optional and is not initialized.

Browser rendering uses the public `@contentful/experiences-react/client` entry;
static/server integration uses `@contentful/experiences-react/server` where
applicable. This browser app uses `/client` for both free fetching and supplied-plan
rendering. Preview integration must use
the frozen package's public exports and Runtime's supported initializer; see
[Runtime preview limits](../../packages/runtime/README.md#optional-runtime-live-preview).

- `src/App.tsx`, `src/main.tsx`, `index.html`: React shell, route labels, normal
  links, title/active-link updates, application-owned load, commit-time managed
  ownership, final-exit/BFCache handling and local assets.
- `src/experiences.ts`: pure factory binding of the registry once, shared by the
  managed root and supplied-plan renderers; no SDK construction at module scope.
- `src/ConsentControls.tsx`: consent state hooks and receiver-safe `setConsent`
  action for independent event/persistence Grant/Revoke controls.
- `src/attempt-log.ts`, `src/TrackingLog.tsx`: early retained event subscription,
  notification counts, actual view/hover interval grouping and cleaned-up age timer.
- `src/content-loader.ts`: concurrent free fetches for distinct route IDs with
  source maps, per-ID error results and plan reuse; no runtime initialization.
- `src/experience-config.tsx`: coded component/template registrations, generated
  source-field types, binding checks, Rich Text and the actual named `slot`.
- `src/ExperiencePresentation.tsx`: standard supplied-plan renderer, content/error
  presentation, context-based manual-view registration and per-kind automatic flags.
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

The loader starts once per document outside React render/effect replay. It requests
`extensions: { sourceMap: {} }`, fetching each distinct route ID concurrently once.
Results retain route order regardless of completion order.
Home requests all configured IDs; Page Two requests the last and the first
(unless they are the same). Both manual presentations reuse the same plan object;
on Home the automatic presentation also uses it. Errors for one ID do not stop the
remaining requests. React subscribes to the resulting page load with a stale-result
guard. This is a single application load, with no general cache, page/identify
operations, personalization input, route initialization barrier or preview work.
Ordinary document navigation starts a new load. Loading, missing configuration,
request errors, empty plans and SDK content diagnostics are displayed truthfully.

The read-only space export at
`lib/mocks/src/contentful/data/space/ctfl-space-data.json` establishes these mappings:

| Registration / binding      | Evidence and final presentation                                                                                                                                                                                                                                                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `codedComponent`            | Data assembly `5yb8t7OHz3FgDoriyuR2Ek` permits `content` entries. Its GraphQL resolver selects `internalTitle`, `text`, and `richText { document: json }`, returning `title`, `text`, and `richText`. Rendered as a card.                                                                                                                                             |
| `codedExperienceTemplate`   | Data assembly `6qkMYKRvKerQnsOX3Hdc2N` has the same source-field aliases/wrapper. The template declares the named `slot`; the coded Experience fills it with coded and personalized fragments.                                                                                                                                                                        |
| Composed component/template | `246bbtx2pFLq7paqNanBXp` and `1xrW5RkILRtGaWxGhtqtE7` delegate to the coded component assembly, then map outputs through TypeRef properties (`cp_r8UEGKwoXF` / `cp_XxhQNVJuDb` and `cp_17S_0fGkrF` / `cp_iFJCJZhqU-`). Their component trees expand into `codedComponent` nodes. The composed template also inserts its `slot`. No app-side tree expansion is needed. |
| Personalization variants    | The fragment switches `content` entries through the same assembly; the personalized composed Experience swaps its two entry parameters. This app supplies no visitor context and does not claim that a returned plan is personalized.                                                                                                                                 |

The title/text/document value types derive from
`TypeContentWithoutLinkResolutionResponse['fields']`, rather than schema markers.
The SDK's incoming content remains unknown-valued. Registration `resolveData`
checks strings and the Rich Text document wrapper/node structure; rendering repeats
those checks for supplied plans and the SDK's resolver-error fallback. Missing or
malformed values produce field-specific errors rather than asserted content or
invented defaults. These checks do not validate every editorial Rich Text rule.
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
at the pinned revision. That example disables only automatic views; this section
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
not preview connection or content success. This phase has no state handoff or
route-page coordinator. Root configuration is captured for the mounted owner;
structural changes require deliberate key replacement, while locale is mutable.
An application-owned SDK can instead be injected through `ExperiencesProvider`;
independent providers may share a public `/host` binding. This reference uses one
managed root; shared-root ownership coverage belongs to SDK tests.

Startup consent/profile defaults are unset. State comes from the SDK and its
existing persistence policy, with no application profile or consent store.
Grant/Revoke changes event and persistence consent independently, with no content
fetch or page action from a consent subscription. Event consent gates tracking;
persistence consent gates durable profile continuity. No visitor profile is
initialized here. Analytics dispatch and attempt notifications require an available
runtime event profile or identity. Granting event consent alone does not make
interaction attempts appear for a fresh visitor without that prerequisite.
A profileless `trackView` can return `{ accepted: true }` with no `eventStream`
notification or network request. The sidebar counts actual notifications, which
do not establish successful transport delivery.
Page/identify/reset/retry and managed preview
content are deferred to Phase 6.

The stable `onStatesReady` callback attaches the optional sidebar's retained
subscription during activation, before root-driven work. It ignores the immediate
historical `.current` emission on every attachment. Each later event notification
increments the attempt count, even when message IDs repeat. Only real view/hover
interval IDs with durations group into one row; the row shows the latest duration,
first-observed age and notification count. React renders labels as text. These
rows describe attempts before queue admission/transport completion, never delivery
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

The ownership/consent/sidebar patterns were traced with `git show` at Optimization
commit `59add9d6ebff503b9033a59a2eee0149d4b4e925`: React `OptimizationProvider`,
Web `presentation/optimizationRootRuntime.ts`, and the maintained React reference's
`main.tsx`, `ControlPanel.tsx` and `AnalyticsEventDisplay.tsx`. The retained
Experiences differences are supplied XDA plans rather than local CDA variant
resolution, no route-page work until Phase 6, SDK-normalized attribution data,
and skipping historical notifications when attaching diagnostics. The pinned
reference is evidence only, with no adjacent-checkout runtime dependency.

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

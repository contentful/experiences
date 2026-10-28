# Experiences React SDK rendering reference

This private standalone React/Vite application loads and renders real Experience
plans. It consumes locally packed SDK artifacts outside the
root npm workspaces.
Home (`/`) and Page Two (`/page-two`) use ordinary document links, including direct
navigation and browser back/forward. The Web reference's theme, Tracking sidebar,
Utilities area and split content layout establish the presentation for subsequent
integration work.

The application loads real Experience plans through the public React `/client`
free `fetchExperience` API and renders them with `ExperienceRenderer`. This
application-owned loading/supplied-plan path remains supported when managed
loading arrives. It creates no Web SDK runtime and submits no events. Utilities
and the Tracking sidebar explain their pending availability without inactive
controls or fabricated event counts. Credentials are unnecessary to build and
start; content loading requires the app-local space and browser-approved Delivery
token. Runtime ownership/hooks and controls arrive in Phase 5, and managed
content/navigation/preview in Phase 6. See the
[implementation plan](../../tmp/react-next-runtime-implementation-plan.md#phase-4-add-standard-attributed-rendering)
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
these values for Delivery requests; loading content does not create a Web runtime.
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
Rich Text React renderer/types. Web remains declared for Phase 5 but is not imported
or constructed. Preview remains optional and is not initialized.

Browser rendering uses the public `@contentful/experiences-react/client` entry;
static/server integration uses `@contentful/experiences-react/server` where
applicable. This browser app uses `/client` for both free fetching and supplied-plan
rendering. Preview integration must use
the frozen package's public exports and Runtime's supported initializer; see
[Runtime preview limits](../../packages/runtime/README.md#optional-runtime-live-preview).

- `src/App.tsx`, `src/main.tsx`, `index.html`: React shell, route labels, normal
  links, title/active-link updates, application-owned load and local assets.
- `src/content-loader.ts`: sequential free fetches for distinct route IDs with
  source maps, per-ID error results and plan reuse; no runtime initialization.
- `src/experience-config.tsx`: coded component/template registrations, generated
  source-field types, binding checks, Rich Text and the actual named `slot`.
- `src/ExperiencePresentation.tsx`: standard supplied-plan renderer, content/error
  presentation and per-kind automatic tracking flags for the manual-view section.
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
`extensions: { sourceMap: {} }`, fetching each distinct route ID sequentially once.
Home requests all configured IDs; Page Two requests the last and then the first
(unless they are the same). Both manual presentations reuse the same plan object;
on Home the automatic presentation also uses it. Errors for one ID do not stop the
remaining requests. React subscribes to the resulting page load with a stale-result
guard. This is a single application load, with no general cache, page/identify
operations, personalization input, shared initialization barrier or preview work.
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
Neither section measures interactions without a Web runtime.

The app retains no root map or readiness counts and installs no placeholder
`onNodeRoot` callback. Future managed loading/context integration will add actual
manual registration through the public SDK tracking API, using `onNodeRoot`'s
`{ element, node, attribution, data: ScopeAttribution | undefined }`. The SDK normalizes `data`
to the innermost rooted scope; consumers need not choose `roots.at(-1)`. The existing
callback lifecycle supplies registration cleanup on detach/replacement. Consent,
identity, tracking controls and the event sidebar remain Phase 5 work; managed
loading, initialization, retry/reset orchestration and preview remain Phase 6 work.
Both phases remain pending.

Use scoped build/lint/typecheck and direct inspection of this maintained app for
validation after refreshing the installed tarballs. Inspect both routes, repeated
roots, the named slot, Rich Text, missing/malformed content, attribution attributes
and per-kind flags. No network unit tests, MSW, E2E tooling, simulated services or
temporary consumers belong to this reference. Build/typecheck establishes artifact
consumption, not live service results or later consent/tracking/preview behavior.

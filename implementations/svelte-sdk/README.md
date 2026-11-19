# Experiences Svelte SDK reference

This private standalone SvelteKit 3 application demonstrates the managed Svelte
adapter against locally packed public SDK artifacts. Start at
`http://127.0.0.1:3600/hybrid/single-experience` for the normal one-Experience
workflow. The vendored React reference theme includes its complete Optimization
provenance and MIT license. Coded cards, the coded Experience Template and its
named `slot` retain the same generated source-content mappings and Rich Text
rendering as React/Next. Hyperlink rendering additionally rejects unsafe URL schemes
and control characters while retaining escaped label content; safe HTTP(S), mailto,
tel and relative links retain anchors. Structural Rich Text validation alone does
not establish safe hyperlink targets.

## Rendering modes

| Mode           | Primary routes                                             | Initial document                                                                                | Later navigation/actions                                                                                        |
| -------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Hybrid         | `/hybrid`, `/hybrid/page-two`, `/hybrid/single-experience` | Node prepares content and a full optional handoff; Web adopts the captured Kit source           | Native Kit navigation prepares an exact source; explicit browser actions select ordinary Web content            |
| SSR            | `/ssr`, `/ssr/page-two`, `/ssr/single-experience`          | Ordinary Node content/event work with server initial-page ownership and private state hydration | Native enhanced navigation uses preparation and Web adoption; explicit browser actions use ordinary Web content |
| Direct-Web CSR | `/csr`, `/csr/page-two`, `/csr/single-experience`          | `ssr=false`; metadata only, with no Node preparation                                            | The committed selecting view starts an ordinary Web fetch with the root's page payload                          |

Mode links use full document navigation. Ordinary links within a mode use native
Kit navigation and back/forward. One retained `ExperiencesRoot` destructured from `request` consumes
`page.data.primarySource`, rather than a retained layout data snapshot. Its explicit
route key comes from the same committed loader metadata, so shallow Identify/Reset
URL edits do not reclaim an old Kit source as a new visit. CSR omits
that source and uses the same root's Web owner. There is no `hooks.client.init`,
second root, competing Web instance or server-backed `ssr=false` bootstrap.
Binding modules are browser-safe and do not construct Web during import.

One lazy server binding handles `/_exo/prepare`. Its `request.mode` reads the
trusted outer document route to select `ssr` or `hybrid`. The public preparation
handler remains noncommitting. Hydration
reuses Kit's captured response, and unused preloads cannot adopt browser state or
replay events. Source history and Preview activation policy remain SDK-owned.

The primary plan is read from reactive `current.data`. The complete operation
stays in `current.result`; a failed Retry can coexist with retained applicable
content without relabeling its provenance. Loading, safe content errors, empty
success, missing registrations, component fallback recovery and missing local
configuration are visible. Ordinary initial missing content can produce HTTP404;
Preview acquisition failures do not become ordinary missing content. No backend
message text is used to infer missing/authorization status.

## Setup and lifecycle

Use Node >=22.18.0 (validated with Node 24.15.0), installed root dependencies and
the existing Nx lifecycle. From the repository root:

```sh
npx nx run implementation-svelte-sdk:setup
npx nx run implementation-svelte-sdk:dev
```

`install` explicitly packs `adapter-svelte`, `node` and `web` and uses
`package-tools:pack-preview`. The shared `scripts/install-implementation.ts`
installs all eight SDK tarballs with internal-chain overrides, workspace
participation/install scripts/lockfile generation disabled. It copies
`.env.example` to `.env` only when absent. `setup` then builds the reference.
Do not refresh dependencies while the application is running. During coordinated
SDK work, the parent can freeze packs and the shared installer can be run directly:

```sh
node_modules/.bin/tsx scripts/install-implementation.ts implementations/svelte-sdk
```

The `scope:implementation` tag makes root aggregate setup and Build CI discover
this app; root package aggregate checks exclude references. All native targets
are scoped:

```sh
npx nx run implementation-svelte-sdk:install
npx nx run implementation-svelte-sdk:build
npx nx run implementation-svelte-sdk:typecheck
npx nx run implementation-svelte-sdk:lint
npx nx run implementation-svelte-sdk:test
npx nx run implementation-svelte-sdk:serve
npx nx run implementation-svelte-sdk:status
npx nx run implementation-svelte-sdk:logs
npx nx run implementation-svelte-sdk:restart
npx nx run implementation-svelte-sdk:stop
npx nx run implementation-svelte-sdk:clean
```

`serve` builds and starts PM2 process `experiences-svelte-sdk-app`; `stop` and
`serve:stop` delete only that process. `restart` rebuilds before restarting.
`dev` uses Vite. Production `start` uses adapter-node's handler on loopback port 3600. `GET /health` returns application health without credentials, content loading,
SDK activation or external APIs. `clean` removes only reproducible app outputs.

For production requests, adapter-node needs the public origin in its process
environment or a trusted proxy configuration that derives the correct origin.
For a local production run:

```sh
cd implementations/svelte-sdk
ORIGIN=http://127.0.0.1:3600 npm run start
```

Pass the same process environment when starting through PM2 or deploying to
another host, using its public origin. The app's `.env` value controls the
Delivery proxy's origin checks separately. A healthy listener can still
reject browser preparation POSTs with HTTP 403 if adapter-node sees a
different origin.

Direct application pins are Kit **3.2.0**, Svelte **5.57.3**, TypeScript **6.0.3**,
Vite **8.3.8**, vite-plugin-svelte **7.3.1**, adapter-node **6.0.2** and
svelte-check **4.7.8**. Root TypeScript stays 5.9. Re-run local checks after replacing
tarball bytes; the shared installer removes the stale application install first.

## Private configuration and browser credentials

Build/start/health need no credentials. Set only this app's `.env` for real content:

- `SPACE_ID`, `ENVIRONMENT_ID` (default `master`), private `CDA_TOKEN`, and `LOCALE`.
- `ORIGIN`, matching the public host, defaults to `http://127.0.0.1:3600`.
- Optional `BROWSER_CDA_TOKEN`, explicitly approved for browser exposure. Blank
  uses the real same-app Delivery proxy, which adds private upstream authentication.
- Optional comma-separated `EXPERIENCE_IDS`. Blank uses the three reference IDs.

Server configuration reads `.env` lazily. Vite reads the explicit public allowlist
at build/dev startup, so rebuild/restart after configuration changes. Private
server credentials, management credentials and convenience session values are
never serialized. Use browser-designated credentials or the proxy; do not copy
server tokens into public defaults. Existing environment files are preserved by
setup; migrate values deliberately in the local file without replacing it from a
sibling implementation.

The proxy fixes the Delivery upstream, space, environment and configured IDs,
forwards only supported wire headers, rejects token/Preview query overrides and
cross-origin POSTs, bounds POST bodies to 256 KiB and refuses upstream redirects.
Responses and request results are private/no-store. This is a maintainer reference
for configured content, not an unrestricted proxy or authentication service.
Personalized results/handoffs must not be cached, persisted, logged or shared.

Default IDs match every reference:

- `3fLAdFb3BYAuImRhcW8k4t` — Coded Experience.
- `4WzbgzPQHa9Tr2ffbOU8p7` — Composed Experience.
- `7u2eP09B4BIBToH8UwSHck` — Personalized Composed Experience.

The application copies `src/contentful-generated.d.ts` unchanged. The existing
repository generation workflow discovers implementation source directories; no
app-local generator is introduced. Bound `title`, `text` and `richText.document`
value types derive from the generated content entry's `fields`; admin assemblies
alias `internalTitle` and wrap Rich Text. Resolution inputs still have the SDK's
unknown-valued content type, and a passing typecheck is not live schema validation.

## Utilities and tracking

Utilities expose separate event/persistence consent, Identify, Reset, event-free
Retry, automatic interaction enable/disable and Page Two's `CUSTOM TRACK`.
Startup consent/profile defaults stay unset. An application-owned consent cookie
mirror supplies explicit decisions to Node; an identity cookie is not consent.
The SDK owns persistence, profile adoption, event validation and queue policy.

Initial `?userId=charles` supplies Identify with the page attempt. Later navigation
carries page intent without repeating Identify. Ordinary CSR page intent uses the
root's `buildPagePayload`, with Web supplying browser context. The Identify button
and CUSTOM TRACK call `current.acquire({ personalization })` with fresh nonpage
intent for the committed selector. Native shallow routing updates the Identify URL
without starting a second Kit load. The same managed view presents both Kit and
Web outcomes, and Retry follows the active source without new events, replay or
event hooks.

Reset first removes the attributed content synchronously with Svelte `flushSync`,
then calls the SDK action. Completed data retained by SDK policy stays concealed
until a fresh successful replacement; Reset itself starts no content/page work and
does not remount the selecting controller. Ordinary source changes and authoritative
missing/authorization results keep their independent applicability rules.

Home loads one primary plus event-free diagnostic comparisons; Page Two selects
the last default ID and shows the coded plan for manual comparison. Later IDs have
no visitor intent and do not inherit the primary's profile. This diagnostic
multi-ID view is application-owned: official support is **one Experience per page**,
without a cross-fetch guarantee. Server comparisons use `serializePlan` for native
Kit data. The UI uses a fixed warning if diagnostics are present, keeping server
error details, causes, stacks, visitor state and metadata on the server.
The single-Experience routes use only the primary.

Automatic presentations forward attributes to actual DOM roots. Manual containers
carry `data-ctfl-manual-views="true"`; their actual roots disable automatic views,
hovers and clicks. The existing Web discovery/measuring path independently observes
those real roots, including repeated presentations of the same plan. There are no
application-owned observers, DOM scanners/maps, simulated interaction buttons or
repeated event-bearing content sources. The automatic setting lives in retained-root context, survives page navigation,
and is reapplied to each fresh owned Preview activation through public
`actions.tracking.enable/disable`; consent/lifetime policy still gates measurement.

The Tracking sidebar subscribes through `onStatesReady` before runtime-driven
work. It shows event attempts, blocked notifications and cumulative view/hover
interval durations grouped only by real interval IDs. Attempts and SDK acceptance
are **not successful delivery or commitment receipts**. Complete profiles,
attribution and permitted consent remain prerequisites for Analytics attempts.

## Deployment-gated Preview and SSR recovery

Leave `LIVE_PREVIEW_ENABLED` blank for ordinary deployments. Only the exact value
`true` includes the capability. Enabled deployments require private `PREVIEW_TOKEN`
and a distinct browser-approved `BROWSER_PREVIEW_TOKEN`; optional server/browser
hosts remain separate. `LIVE_PREVIEW_SESSION_HOST` and
`LIVE_PREVIEW_RESOURCE_RESOLUTION` configure that transport. Disabled builds omit
capability even if the URL contains a session.

`LIVE_PREVIEW_SESSION_ID` is an unread local convenience field. Copy it manually
into `?preview_session_id=...`; a nonempty trimmed URL session activates Preview.
The optional public `createLivePreviewClient` factory is attached to the browser
binding only in enabled deployments. Node uses its separately configured snapshot
transport. SDK-owned matching IDs, session transitions, event suppression and
teardown remain authoritative. Session changes create a fresh owned activation
below stable request history; connection errors preserve Preview isolation and
cannot restore visitor events or substitute published content.

Ordinary comparison fetches are omitted in active Preview. The primary selector
leaves source-map options to the session. If the session reports a different ID,
ordinary Delivery uses the reference's configured defaults without the explicit
source-map extension. The selected primary plan is still reused for
automatic/manual/repeated presentations, without inventing session content for
another ID. Live Preview service verification is
explicitly deferred because of the upstream500; local wiring/configuration,
compiler/build/package proof is required. That deferral does not block local
implementation, and no remote Preview retry/probe belongs to this change.

Kit 3 supplies native per-node SSR recovery through this app's synchronous
`handleError`, returning only a sanitized JSON-safe message. Original errors remain
in server logs. The custom component fallback offers native node-render reset;
that reset is separate from content Retry and visitor Reset. No async compiler
opt-in is needed for this synchronous Kit 3 hook. Kit 2 hosts instead require both
`compilerOptions.experimental.async=true` and
`kit.experimental.handleRenderingErrors=true`. A recovered boundary is not a
promise of HTTP200, and SSR component exceptions do not populate SDK browser
diagnostics. See the [adapter recovery guide](../../packages/adapter-svelte/README.md#component-errors-and-rendering-recovery).

## Validation limits

Run the reference's native typecheck, lint, content security tests and production build against the frozen
archives, then use its own health/lifecycle paths. Mechanical Preview validation
uses sentinel/config-free build inputs and public projection without contacting
upstream APIs. Live Destinations walkthroughs and attribution also remain deferred.
The [SDK release hold](../../packages/adapter-svelte/README.md#service-verification)
still requires verification against corrected deployed behavior. The four focused Rich Text security/formatting cases use the existing Node runner
(`cd implementations/svelte-sdk && node --test src/lib/content.test.mjs`).
No mock backend, new E2E runner, extra test app or generator is part
of this reference. Live content/event/tracking observations require coordination;
build/package success alone cannot establish live service commitment or a working
Preview service. User acceptance remains separate from implementation/checks.

# Experiences Next.js SDK server reference

This private application consumes packed public SDK packages outside the root npm
workspaces. It uses standard Next.js 15.5 hosting with React 19 and Node >=22.13.0.
Its server foundation shares the sibling references' content mappings, Contentful
Rich Text renderer, named `slot` presentation and locally vendored theme.

Home (`/`) and Page Two (`/page-two`) use the public Next server binding and
ordinary Node SSR fetching. A stable SDK is initialized lazily from server-only
configuration; React `cache` shares the host loader's result within a server render
for the same pathname and search-params object reference. Both routes pass Next's
resolved `searchParams` object unchanged; ordinary and repeated presentations use
that one result. Equal-valued copies are distinct cache inputs, so callers sharing
a render must reuse the original object rather than reconstructing it.
The loader binds one request facade, fetches the route's display/comparison IDs
sequentially and destroys the facade in `finally`. Available plans render independently of other
fetch failures. Phase 10 adds router bindings, distinct Pages Router paths and
browser takeover in this same app.

## Setup and lifecycle

From the repository root, once the SDK contracts and artifacts are ready:

```sh
npx nx run implementation-nextjs-sdk:setup
npx nx run implementation-nextjs-sdk:dev
```

`install` packs Next, Node, Web and React dependency chains plus the existing frozen
Preview artifact through `package-tools:pack-preview`. It uses the existing
`scripts/install-implementation.ts` helper. Installation replaces only this app's
`node_modules`, disables workspaces, install scripts and lockfile generation, and
copies `.env.example` to `.env` only when absent. `setup` then builds the app. Stop
this app before refreshing its dependencies. `build` never installs or packs.

Next build/dev/start commands set `NEXT_IGNORE_INCORRECT_LOCKFILE=1`, the installed
Next version's opt-out for automatic SWC lockfile repair. This standalone app
intentionally has no local lockfile; Next must not search upward and patch the
repository lockfile. Scoped PM2 launch/restart passes the same flag, with
`--update-env` on restart. Dependency installation remains the maintained setup
helper's responsibility; versions and the root lockfile are unchanged.

The `scope:implementation` project tag includes this app in root
`npm run implementation:install` and Build CI's reference build/lint/typecheck
selection. Ordinary root aggregate checks exclude reference apps.

```sh
npx nx run implementation-nextjs-sdk:install
npx nx run implementation-nextjs-sdk:build
npx nx run implementation-nextjs-sdk:lint
npx nx run implementation-nextjs-sdk:typecheck
npx nx run implementation-nextjs-sdk:serve
npx nx run implementation-nextjs-sdk:status
npx nx run implementation-nextjs-sdk:logs -- --lines 20 --nostream
npx nx run implementation-nextjs-sdk:restart
npx nx run implementation-nextjs-sdk:serve:stop
npx nx run implementation-nextjs-sdk:clean
```

Local npm scripts expose the same commands. `dev` runs standard `next dev`;
`start` serves an existing production build. `serve` and `restart` build before
launching or restarting. PM2 manages only `experiences-nextjs-sdk-app`.
All hosting commands bind `127.0.0.1:3500`; use
[http://localhost:3500](http://localhost:3500) consistently. Pass `--port` to the
foreground Next script if that port is occupied, and set app-local `ORIGIN` to
match that address. Never stop unrelated processes.
`clean` removes only `.next`, `out` and the local TypeScript incremental output.
The API-free `/health` endpoint returns `ok`.

For a production run of this server reference, install its packed dependencies,
keep the private app-local `.env` on the server, then use `npm run build` followed
by `npm run start` from this directory, or the scoped `serve` target above.
Standard Next hosts the dynamic routes; no custom server or static export is used.
Set `ORIGIN` to the trusted address visitors use. The configured SDK and `.env`
values are read lazily on the first content request and retained for that server
process; restart after changing them. Health does not initialize the SDK.

## Configuration and boundaries

Populate this app's `.env` with real `SPACE_ID` and `CDA_TOKEN`; tracked
`.env.example` contains no credentials. `ENVIRONMENT_ID` defaults to `master` and
`LOCALE` to `en-US`. `ORIGIN` defaults to `http://localhost:3500` and must be a
trusted HTTP(S) origin without credentials, path, query or hash. It supplies page
URLs independently of incoming Host/forwarded headers; match it to the actual
hosting address when changing the port. An optional comma-separated `EXPERIENCE_IDS` overrides the
shared defaults:

- `3fLAdFb3BYAuImRhcW8k4t` — Coded Experience
- `4WzbgzPQHa9Tr2ffbOU8p7` — Composed Experience
- `7u2eP09B4BIBToH8UwSHck` — Personalized Composed Experience

`src/config.ts` reads only this app's `.env` at request time and is guarded by
`server-only`. It does not read sibling configuration or merge process variables.
No environment object, credentials or SDK instance is passed to presentation.
There are no `NEXT_PUBLIC_*` settings or browser runtime in this foundation.
Phase 10's browser configuration must use an explicit allowlist and approved
browser credentials; server preview tokens remain private.

Optional preview settings are `LIVE_PREVIEW_ENABLED`, `PREVIEW_TOKEN`,
`PREVIEW_HOST`, `LIVE_PREVIEW_EXPERIENCE_ID`,
`LIVE_PREVIEW_SESSION_HOST` and `LIVE_PREVIEW_RESOURCE_RESOLUTION`. The optional
package is installed from its unchanged artifact. Preview activates only when
`LIVE_PREVIEW_ENABLED=true` and a nonempty `preview_session_id` is supplied in the
URL. Experience selection uses local settings or `preview_experience_id`.
`LIVE_PREVIEW_SESSION_ID` is retained in local `.env` only for convenient copying;
application/build code never reads it. Both preview fields are blank in
`.env.example`. Missing/empty session parameters and a falsy flag keep the request
ordinary, even with a nonempty session parameter in the URL. The bound request
receives an explicit `isPreview: false` in those cases, retaining ordinary event
handling. Phase 10's browser owner/sidebar must use the same policy, subject to
normal consent/identity requirements. Active preview supplies a lazy implementation loader that imports the
public Preview package. Node owns policy and snapshot loading through ordinary
`fetchExperience`. Matching session requests omit ordinary locale/source-map fetch
options. Session transport uses the frozen helper without a custom fetch wrapper.
Both content routes are dynamic and use `force-no-store`; ordinary Delivery uses
`createNextjsPrivateFetch`. There is no preview broker or application preview client.

Ordinary SSR uses one request facade and ordinary Experience fetching.
Home displays all configured IDs with the first as primary. Page Two displays
only the last configured ID as primary. That route's primary fetch runs first with
initial intent; remaining display/comparison IDs load sequentially without events.
Both routes reuse the first configured ID's plan for repeated containers; Page Two
fetches it after its primary when they differ. Official support is one Experience per page, unenforced; these
comparisons provide no SDK multi-Experience or cross-fetch guarantee. Only an actual
server-to-browser transfer uses the Node full handoff result producer. Content
presentation does not depend on replay or submission success. XDA preflight leaves
ordinary SSR/CSR events uncommitted; this app adds no XPAPI compensation or force flag.

The initial ordinary fetch carries literal page-builder arguments and, only for
`?userId=charles`, literal identify arguments with `traits: { identified: true }`.
The SDK builds and consent-gates these inputs once. Later IDs carry no events.
Preview carries neither page nor identify intent. The request page comes from the
SDK's explicit page-context helper, using the trusted configured `ORIGIN` and
incoming referrer; the host reads Next headers/cookies only in its server loader.

Consent comes from separate application cookies
`experiences-nextjs-event-consent` and `experiences-nextjs-persistence-consent`,
using `granted`/`denied`; absence is undecided. There are no consent controls in
this server foundation. The host passes the cookie reader and explicit consent
separately. The public binding reads identity only with granted persistence consent
and excludes identity in preview; an identity cookie never grants consent.
Server Components do not write response cookies and the request binding has no
persistence method. A response handler owns identity-cookie persistence at its
supported response boundary; this Server Components reference does not call a
response-cookie helper.

These routes request `Cache-Control: private, no-store` and disable framework
content caching. Production inspection returned `Cache-Control: private, no-store` while retaining
Next's framework `Vary` headers.
Plans and diagnostics stay in the server subtree; there is no browser bootstrap,
private handoff or serialized visitor state. Public SDK serializers and the actual
hybrid result producer apply when Phase 10 adds a real browser transfer.

## Public server integration

`src/config.ts` owns lazy process SDK configuration, and `src/server-loader.ts`
owns render-local request loading. Both import their utilities from
`@contentful/experiences-nextjs/server`. The frozen public source defines these
signatures used by this reference:

| Utility           | Signature / result                                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Stable SDK        | `configureNextjsServerExperiences(config: ExperiencesNodeConfig): ContentfulExperiences`                                         |
| Request binding   | `bindNextjsExperiencesRequest(sdk: ContentfulExperiences, options: BindNextjsExperiencesRequestOptions): ExperiencesNodeRequest` |
| Explicit page     | `createNextjsPageContext(options: CreateNextjsPageContextOptions): NonNullable<UniversalEventBuilderArgs['page']>`               |
| Private transport | `createNextjsPrivateFetch(fetchImplementation?: typeof globalThis.fetch): typeof globalThis.fetch`                               |

The stable SDK is the public Node SDK. The binding returns the actual
`ExperiencesNodeRequest` directly. Binding options require `consent` and accept
explicit `request: NextjsRequestLike`,
`cookies`, `page`, `locale`, `livePreview`, `isPreview` and the existing Node request
options. The loader passes a string URL derived from trusted `ORIGIN`, actual Next
headers/cookies, independent consent and locale. The binding derives event page
context and user agent from that request and owns cookie identity admission.
The loader keeps explicit page-builder properties separate from event context.
The request facade has the Node request methods directly, including
`fetchExperience` and `destroy`; there is no binding wrapper or persistence method.
At a writable response boundary, the handler owns cookie persistence through the
public `persistNextjsAnonymousId(response, request, options?)` helper, with
`request` as the bound `ExperiencesNodeRequest`. Its response type is
`NextjsResponseLike` (`headers: Headers`, with optional Next cookie jar), and its
optional settings are `PersistNextjsAnonymousIdOptions`. This helper does not
apply response cache headers; `applyNextjsPrivateResponseCache(response)` takes
the same response type and sets `Cache-Control: private, no-store`. Neither
response helper is used during Server Component rendering.

`CreateNextjsPageContextOptions` requires `path` and optionally accepts `origin`,
`url`, `referrer` and `searchParams`. The loader supplies
`{ path, origin, referrer, searchParams }` once, directly from Next's search-params
object and the trusted configured origin. The helper derives
`path` from `path` and query and search properties from `searchParams`; explicit
`url` supplies only the returned page URL. Passing Next's `searchParams`
preserves repeated query values in page properties independently of request event
context. Route-key construction and sanitized middleware forwarding remove
`_rsc`/hashes and normalize search encoding; page-context construction does not.
The primary ordinary call is
`request.fetchExperience(descriptor, { config: experienceConfig })`; it returns a
`PortableRenderPlan`. Rendering stays server-only, so this flow creates no handoff
and calls no browser serializer or response-cookie helper.

`createNextjsPrivateFetch(fetchImplementation?: typeof globalThis.fetch)` is used
in server-only SDK configuration to force Delivery fetches to `no-store` while
preserving request details. It does not set response cache headers.
`applyNextjsPrivateResponseCache(response: NextjsResponseLike): void` is the
separate response helper for writable handler responses; the dynamic routes also
disable framework content caching and are documented above. This app uses the
fetch helper in `src/config.ts`, not the response helper.

The same entry exports these transfer utilities:

```ts
import type { ExperiencesHandoff } from '@contentful/experiences-node';
import type { PortableRenderPlan } from '@contentful/experiences-nextjs/server';

declare function createNextjsRouteKey(input: string | URL): string;
declare function serializeNextjsPlan(
  plan: PortableRenderPlan,
  options?: { readonly metadataKeys?: readonly string[] }
): PortableRenderPlan;
declare function serializeNextjsHandoff(
  handoff: ExperiencesHandoff,
  scope: Pick<ExperiencesHandoff, 'spaceId' | 'environmentId'>
): ExperiencesHandoff;
declare function serializeNextjsJsonForHtml(value: unknown): string;
```

Those APIs support a future actual transfer without an application adapter shim;
they are not prerequisites for this ordinary SSR flow. Their full contracts are in
the [Next SDK README](../../packages/adapter-nextjs/README.md).

## Components and validation

`src/components/ExperienceContent.tsx` groups ContentCard, CodedTemplate and their
shared ContentBody with the bare component registry and content checks. Generated
CDA declarations derive the source field types; this file expresses the configured
assembly aliases and Rich Text wrapper, as in the React reference. Components
retain checks for unknown-valued SDK bindings. Invalid bindings still produce the
generic renderer failure; removing duplicate identity `resolveData` checks removes
only their extra resolver diagnostic and corresponding banner. Generated declarations
and typecheck do not validate every live content variant. Before rendering Rich Text,
the maintained `@contentful/rich-text-types` validator checks the document's node
shapes and parent/child rules for both cards and templates.

`src/components/ServerContentPage.tsx` owns the page shell and passes Next's
search-params object unchanged to the cached loader, which owns page context.
`src/components/ExperiencePresentation.tsx` owns each attributed presentation,
including diagnostics and renderer fallbacks, for both ordinary and repeated plans.
The four `src/app` files retain the layout,
Home, Page Two and health entry points. SDK imports use public Next `/server` APIs.

The generated declaration is copied unchanged from the React reference. The theme
is copied locally from that reference, preserving Optimization stylesheet
provenance and the MIT license; a small server-only layout override removes its
sidebar column. No adjacent checkout, generator change, source alias, custom server,
E2E tooling, MSW or temporary consumer is required.

Run scoped build/lint/typecheck after the installed artifacts are refreshed. Inspect
Home and Page Two directly for delivered content, slots, Rich Text, errors and
repeated attributed containers. Static checks establish artifact/type consumption;
live content and server behavior require configured services. Installation, build,
typecheck and live inspection remain pending while refreshed packed artifacts
are being prepared by the coordinating owner. Scoped lint and authored-file
formatting have passed; the copied generated declaration remains byte-for-byte
unchanged.

# SvelteKit example: Contentful Experiences

A SvelteKit 2 + Svelte 5 app demonstrating `@contentful/experiences-svelte` rendering an Experience payload fetched from XDA. Mirrors `examples/nextjs/` 1:1 in registered components, slugs, and visual output; the only thing that changes between the two apps is the framework-specific setup.

## What it shows

- **Managed Kit server/client bindings**: universal route loaders select one primary Experience with `request.loadExperience`. Native `event.fetch`, the server `handleFetch` hook and the preparation endpoint capture the complete result for SSR and hydration.
- **SSR rendering and stable browser ownership**: one `request.ExperiencesRoot` above content and consent controls receives the active `page.data.primarySource`. Ordinary links, preload, navigation and back/forward retain the browser SDK.
- **Live preview via `preview_session_id`**: the managed owner handles matching session content and updates, isolating Preview state and suppressing events. Capability is explicitly enabled per deployment; live-service verification is deferred while the upstream Preview service returns HTTP 500.
- **Styling from design props**: resolved design auto-fills each component's `$props()` by key, and every component here declares the design keys it consumes and styles from them. That is the recommended styling contract.
- **One escape-hatch demo**: `Card.svelte` styles itself from props like the rest, but its nested `CardCta.svelte` — not a registered component, so it has no props of its own — reads the card's design with `getDesignValues()` inside a `$derived`. That's the case props can't cover.
- **Design tokens**: `experience-config.ts` wires a `resolveToken` mapping token ids to CSS values.
- **Component registration**: bare Svelte components for the common case, `defineComponent({ component, ... })` when a component needs `defaults` or `resolveData`.

## Run it

The example is a real integration against Contentful, not a mock. You need a Contentful space with the demo content model + Experience seeded, plus a Content Delivery API token. The [`examples/scripts/bootstrap-example.ts`](../scripts/bootstrap-example.ts) script does the seeding via the management API — see [`examples/scripts/README.md`](../scripts/README.md) for what it provisions.

### 1. Seed the demo Experience (one-time)

```sh
# From the repo root:
npm install
npm run build                          # build the SDK packages

cd examples/scripts
cp .env.example .env                   # fill in SPACE_ID, ENVIRONMENT_ID, CMA_TOKEN
npm run bootstrap                      # seeds the content, a Destination, and its nodes
```

### 2. Run the app

```sh
cd ../sveltekit
cp .env.example .env                   # fill in server and PUBLIC_* configuration below
npm run dev
```

`DESTINATION_ID` is server-generated. The bootstrap prints it at the end; paste it into `.env` and `PUBLIC_DESTINATION_ID`. Set `PUBLIC_SPACE_ID` and `PUBLIC_ENVIRONMENT_ID` to the same scope as `SPACE_ID` and `ENVIRONMENT_ID`. Choose an explicitly browser-approved `PUBLIC_CDA_TOKEN` separately from private `CDA_TOKEN`.

For an existing `.env`, retain its private values and add the `PUBLIC_*` fields from `.env.example`; no automatic token migration occurs. `CPA_TOKEN` now stays server-only. To enable Preview, configure both `LIVE_PREVIEW_ENABLED=true` and `PUBLIC_LIVE_PREVIEW_ENABLED=true`, private `CPA_TOKEN` and separately browser-approved `PUBLIC_CPA_TOKEN`. Leave both gates false until the deployment's Preview API is ready. Existing environment files are not overwritten by this migration.

A trusted authenticated proxy can replace browser credentials by configuring the existing Web `delivery.host`, Preview host options, `personalizationBaseUrl` and `analyticsBaseUrl` in `src/lib/experiences.ts`. Configure each required service explicitly: changing `delivery.host` alone does not reroute events. The proxy must support Delivery (including Destinations), Preview and Optimization requests and their CORS/authentication policies. `/_exo/primary` only prepares/reads the primary server result; it is not a general Delivery or event proxy. Never put private `$env` imports, server tokens or a server binding into a browser module.

`/` is also a demo hub ([`DemoHub.svelte`](./src/lib/components/DemoHub.svelte)): it lists every route, has `?personalization` and `?debug` checkboxes, and sits above the home node. Visit `http://localhost:5173/` (the Destination's home node, the `home` Experience) and `http://localhost:5173/demo/landing` (the `landing` Experience). `/welcome` is a redirect node that sends you back to `/`. Pages are served from a **Destination**: the URL path is the Destination path. To fetch one Experience by id instead, use `http://localhost:5173/experiences/landing`; that route is the simplest Preview Session demonstration. Destination session content has the master/matching-ID limits described below.

For ordinary Delivery, the Destination route ([`src/routes/[...path]/+page.ts`](./src/routes/[...path]/+page.ts)) selects `{ destinationId, path, locale }` and the by-ID route selects `{ experienceId, locale, extensions: { sourceMap: {} } }`. Both omit locale and extensions when an enabled deployment requests a Preview Session. Both pass the opaque source intact to the same layout root. Server authorization checks the route selector, configured Destination, demo intent, and the locale and extension rules for the selected mode. Destination selectors carry no extensions. Trusted server resolve options retain `slug`, `renderer` and debug metadata.

For an initial document, `onResult` records only the matching route key, missing flag and a validated local redirect target in request-local locals. It never throws inside captured fetch. After `resolve(event)` completes, the outer `handle` hook returns a native HTTP 307 with the existing private/no-store headers; unsafe targets remain value outcomes. Browser preparation retains the complete source/result, and managed navigation follows valid Destination redirects only after commitment. Missing ordinary Delivery content renders explicit missing-page UI and maps the matching initial HTML document to HTTP 404 in `hooks.server.ts`. This keeps the captured result intact; it does not select Kit's `+error.svelte` or change serialized `page.status`. Empty content is success; a Preview acquisition 404 is a session error, not route-not-found. Without applicable content, acquisition errors show a safe baseline. Ordinary update failures retain applicable content; **Retry content** calls the shared event-free `current.retry()` server read.

Native anchors and Kit preloading need no custom link or navigation/invalidation loop. Unused preparation has no browser state/event admission authority. Hydration reuses the captured response; ordinary loader reruns remain Kit-owned. This SSR example deliberately omits `request.init`, which belongs to the separate server-backed `ssr:false` composition. Visitor-specific transfers are not prerendered, and the adapter owns `private, no-store` headers on the endpoint and outer captured-fetch document. Never cache or log the complete result/handoff.

For a fully static site, use a **separate public, event-free supplied-plan route** with the supported free `fetchExperience` and `ServerExperienceRenderer` APIs; omit this visitor-specific request root, preparation and private handoff. Drop the query flags and enumerate public paths with `fetchDestinationSitemap`:

```ts
// src/routes/[...path]/+page.server.ts
export const prerender = true;
export const entries: EntryGenerator = async () => {
  const paths: { path: string }[] = [];
  let pageNext: string | undefined;
  do {
    const sitemap = await fetchDestinationSitemap(
      { spaceId, destinationId },
      { accessToken },
      { pageNext }
    );
    for (const item of sitemap.items) paths.push({ path: item.path.replace(/^\/+/, '') });
    pageNext = sitemap.pages.next;
  } while (pageNext);
  return paths;
};
```

Prerendering also needs `$env/static/private`, because `$env/dynamic/private` is unavailable while prerendering. Fetch each enumerated path without personalization and publish only intentionally public content. Do not serialize visitor profiles, events, cookies or private transfer fields into static HTML. The existing free fetch/resolver, static/supplied renderers and low-level Preview APIs remain supported; migration of this example does not remove them.

### Optional: personalization

The bootstrap seeds everything needed: the `Landing (developers)` Optimization
Variant, an EU audience (`demo-audience-developers`), and an Optimization
(`demo-optimization-developers`) that serves the variant to that audience.
Nothing has to be configured in Contentful by hand.

Tick **Personalization** in the top-right corner of any page, or open
`http://localhost:5173/demo/landing?personalization=true`, to see the developer
hero. Without the flag you get the base hero.

With `?personalization=true`, the server binding supplies page-builder arguments with the existing Berlin location through `request.pagePayload`. The SDK constructs the page once using its server channel and consent policy. XDA evaluates that page and resolves the selected content before SSR. With the toggle off, the selector explicitly supplies `personalization: { events: [] }`, suppressing automatic page intent. Explicit Retry/refresh also remain event-free.

The binding uses `request.mode: 'ssr'`: the server owns the initial page attempt, and hydration does not emit a compensating browser page. Enhanced navigation uses noncommitting server preparation and guarded Web admission after route commitment. Admission or displayed content does not prove deployed XDA commitment/profile finalization.

This is a simulation, not geo-targeting: XDA takes the visitor's location from
the event (not the request IP) and defaults to San Francisco (US) when none is
sent. The example sends Berlin whenever the box is ticked, so every tester sees
the same result regardless of where they are. A real app would send the
visitor's actual location.

The shared SDK owns profile persistence subject to consent. The example's consent controls synchronize explicit event/persistence decisions with application cookies for SSR; production applications must connect their real CMP and decide which event types may be sent without event consent.

### Optional: consent

Every page shows a **Consent demo** panel (bottom right), rendered by `src/routes/+layout.svelte`. It uses `getExperiencesActions()` and reactive `getExperiencesState()` from the shared root, and lets you watch consent gating work:

- **Accept all / Reject all / Events only** call `consent(true | false | { events, persistence })`.
- **page** and **track** are Personalization events. With consent undecided, `page` is
  sent (it is in the default `allowedEventTypes`) and `track` resolves
  `{ accepted: false }` and appears under _Blocked events_.
- **view**, **click**, **hover** and **flag view** are Analytics events. They need a
  profile, so send `page` first, and they are gated the same way.
- The panel shows the profile in memory next to the profile in LocalStorage. With
  _Events only_, events are sent but the profile is never written to storage.
- Reload the page: both consent choices are restored, because they are stored in
  LocalStorage the same way the profile is.

The panel uses the same browser SDK as the request presentation. It never constructs or destroys a second runtime. `site-events-consent` and `site-persistence-consent` record the explicit CMP decisions for server authorization; an identity cookie alone never grants consent. Web keeps its existing shared LocalStorage encoding and owns the separate identity-cookie persistence/withdrawal policy. Browser configuration errors leave the controls disabled with a configuration message.

The interaction buttons intentionally send a fixed demo entity. Automatic views, hovers and clicks use SDK-owned attribution discovery on the actual outer elements of every registered sample component and the coded Page template. Components consume their content/design/slot props separately, spread the remaining HTML attributes and attachments onto those existing roots, and append caller styles to their design/layout styles. No wrapper or application-owned observer is added. Ordinary by-ID requests ask for `extensions: { sourceMap: {} }`, so returned node attribution reaches those roots under the renderer's Experience attribution container.

Destination delivery currently has an upstream source-map/node-ID gap, so the same root cooperation cannot create attribution absent from the service response. The example neither invents node IDs nor emulates attribution. Use the by-ID route for measured tracking when the response includes source maps; see the [canonical Destination limits](../../packages/runtime/README.md#destination-selection). Consent and complete-profile requirements still apply to all measurements.

### Optional: live preview

After the Preview deployment is ready, enable both gates and credentials above, then open `/experiences/landing?preview_session_id=<session-id>`. The Contentful app supplies the session ID; blank/whitespace-only IDs are ignored. Capability alone does not select Preview mode. With an active session the SDK suppresses all managed/manual events, automatic tracking and handoff replay independently of socket status. Server snapshots use private `CPA_TOKEN`; the optional browser client factory uses only `PUBLIC_CPA_TOKEN`.

One owner has one session connection. Managed session entry/change/exit tears down the old activation before acquiring a fresh one, while the stable request boundary retains adoption history. Updates route by the reported payload Experience ID; no missing ID is guessed or broadcast. Snapshot/socket failures preserve isolated Preview policy and applicable content from that session or the app baseline, without a published-content fallback on acquisition failure.

Destination Delivery is space-scoped/master-only. Matching session content for Destination selection also requires the configured environment to be `master` and the session payload ID to match the resolved Experience. Other IDs keep their ordinary source after a successful session lookup. That fallback uses the Delivery default locale and skips the example's explicit source-map request because the selector was built for a Preview Session. Preview does not create a multi-Experience content source. Local checks cover Preview configuration and session selection. Live Preview
acquisition and updates and live Destination Delivery and attribution remain
deferred. See the [service verification status](../../packages/adapter-svelte/README.md#service-verification).

### Component rendering recovery

Kit 2 needs both `compilerOptions.experimental.async: true` and `kit.experimental.handleRenderingErrors: true`, configured in `svelte.config.js`. The synchronous server `handleError` logs the original exception only on the server and returns fixed public JSON, never the exception, stack or private message. Native node boundaries render `ComponentFallback.svelte`; its **Try rendering again** button uses the native `reset` callback after hydration. It retries node rendering, separately from event-free content Retry and visitor reset. SSR recovery does not guarantee HTTP 200, and fallback errors still propagate. SDK debug diagnostics do not list SSR component exceptions; the host owns server reporting. See the [adapter recovery guide](../../packages/adapter-svelte/README.md#component-errors-and-rendering-recovery).

### Tokens summary

| Token              | API                | Used by                       | Required?                              |
| ------------------ | ------------------ | ----------------------------- | -------------------------------------- |
| `CMA_TOKEN`        | Content Management | Bootstrap script only         | For seeding                            |
| `CDA_TOKEN`        | Content Delivery   | Private server binding        | Yes                                    |
| `PUBLIC_CDA_TOKEN` | Content Delivery   | Shared browser SDK            | Yes, or configured authenticated proxy |
| `CPA_TOKEN`        | Content Preview    | Private server snapshots      | When server Preview gate is enabled    |
| `PUBLIC_CPA_TOKEN` | Content Preview    | Shared browser Preview client | When browser Preview gate is enabled   |

## Validation

```sh
npm run check
npm run build
```

Use the existing example's selected Kit 2.70.4/Svelte 5.57.3 toolchain. These commands validate types and production packaging; they do not verify live content, upstream commitment or Preview transport. Builds do not prerender or request content. In a shared workspace, use current SDK output prepared by the build owner rather than concurrently rebuilding packages.

## File map

```
examples/sveltekit/
├── src/
│   ├── app.html              # SvelteKit HTML shell
│   ├── app.d.ts              # application source and document-outcome types
│   ├── hooks.server.ts       # captured fetch, HTTP 404 and safe SSR errors
│   ├── routes/
│   │   ├── +layout.svelte    # stable request root, demo hub and shared consent panel
│   │   ├── [...path]/+page.ts          # primary universal Destination selector/source
│   │   ├── [...path]/+page.svelte      # Destination render
│   │   ├── experiences/[id]/+page.ts         # universal by-ID selector/source
│   │   ├── experiences/[id]/+page.svelte     # by-id render
│   │   └── _exo/primary/+server.ts           # native preparation/read endpoint
│   └── lib/
│       ├── experiences.ts    # public browser-safe Kit binding
│       ├── load-experience.ts # shared demo selector with explicit no-event intent
│       ├── server/experiences.ts      # private binding, authorization and page args
│       ├── server/personalization.ts # Berlin page-builder arguments
│       ├── components/       # design-system components; design arrives as props
│       │   ├── ManagedExperience.svelte # shared request presentation/Retry/missing UI
│       │   ├── ComponentFallback.svelte # native rendering recovery
│       │   ├── ConsentPanel.svelte      # shared runtime state/actions
│       │   ├── Button.svelte
│       │   ├── Card.svelte
│       │   ├── CardCta.svelte  # nested child; the getDesignValues() escape hatch
│       │   ├── DemoHub.svelte  # the route list and options shown at `/`
│       │   ├── Heading.svelte
│       │   ├── HeroPlain.svelte
│       │   ├── Image.svelte
│       │   ├── Page.svelte     # registered as a coded Experience Template
│       │   ├── RichText.svelte
│       │   ├── Section.svelte  # renders its `children` slot
│       │   └── Text.svelte
│       └── experience-config.ts    # integration layer (maps components + experience templates into experienceConfig)
├── svelte.config.js
├── vite.config.ts
└── tsconfig.json
```

## Integration pattern

The managed composition keeps application and SDK responsibilities explicit:

1. **Design-system components** stay portable, with no `@contentful/*` imports.
2. **`experience-config.ts`** is the wiring layer that maps Contentful component-type IDs to your design-system components.
3. **Universal routes** call `request.loadExperience(event, { experience })` and return the complete opaque source. The stable layout passes committed `page.data.primarySource` to the bound `<ExperiencesRoot>`; pages render the bound `<Experience>` under it. Bound components are destructured in script and use plain template tags.
4. **Server binding/hook/endpoint** own private source configuration, narrow authorization, consent and safe response policy. Shared client actions/state handle consent and event controls without a second SDK or private token projection.

The only Svelte-specific difference is slots: each slot becomes a prop named after the slot holding a `Snippet[]` (render each with `{@render child()}`), where the React adapter hands you a `ReactNode[]` instead. `children` is just the conventional name for the default slot, not a special case. A slot's raw nodes are also still reachable via `getContentfulComponent().slots` and renderable through the exported `<NodesRenderer />`. See [`packages/adapter-svelte/README.md`](../../packages/adapter-svelte/README.md) for the full Svelte API surface.

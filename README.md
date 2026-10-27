# Contentful Experiences SDK

> ⚠️ **Alpha.** Published to npm. APIs are unstable and will change.

A renderer SDK for Contentful's **Experience Orchestration (ExO)**. You bring a design system; the SDK takes the Experience payload from the Experience Delivery API (XDA) and renders it with your components.

## Documentation

The full documentation is on the Contentful docs site:

| Topic                                                                      | Page                                                                                                                             |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| What the SDK does and which package to install                             | [Overview](https://www.contentful.com/developers/docs/experience-orchestration/experiences-sdk/overview)                         |
| From an empty Next.js project to a rendered Experience                     | [Get started](https://www.contentful.com/developers/docs/experience-orchestration/experiences-sdk/get-started)                   |
| Registry keys, `defineComponent`, slots, experience templates, merge order | [Register components](https://www.contentful.com/developers/docs/experience-orchestration/experiences-sdk/register-components)   |
| `fetchExperience`, preview, runtime parameters, source maps, destinations  | [Fetch experiences](https://www.contentful.com/developers/docs/experience-orchestration/experiences-sdk/fetch-experiences)       |
| Server and client renderers, renderer props, render context                | [Render experiences](https://www.contentful.com/developers/docs/experience-orchestration/experiences-sdk/render-experiences)     |
| Styling from design props, design tokens, `useDesignValues`                | [Style components](https://www.contentful.com/developers/docs/experience-orchestration/experiences-sdk/style-components)         |
| Debug mode, diagnostics, fallbacks, server/client differences              | [Errors and debugging](https://www.contentful.com/developers/docs/experience-orchestration/experiences-sdk/errors-and-debugging) |
| Live preview in the Contentful canvas                                      | [Set up live preview](https://www.contentful.com/developers/docs/experience-orchestration/experiences-sdk/live-preview)          |
| Astro, Vue, and other frameworks without an adapter                        | [Other frameworks](https://www.contentful.com/developers/docs/experience-orchestration/experiences-sdk/other-frameworks)         |

Each package README lists that package's exports.

## Install

```sh
npm install @contentful/experiences-react     # React / Next.js
npm install @contentful/experiences-svelte    # Svelte / SvelteKit
npm install @contentful/experiences-angular   # Angular
```

The adapter is the only package you install for rendering. It re-exports the delivery client, the resolver, the renderers, the types, and the design utilities.

Without a framework adapter, use [`@contentful/experiences-node`](./packages/node) for server-side fetch, resolve, and events, [`@contentful/experiences-web`](./packages/web) for the same in the browser, and [`@contentful/experiences-live-preview`](./packages/live-preview) for live preview. The `-sdk-core`, `-design`, `-client`, and `-runtime` packages are workspace-internal.

## Quick start (React)

Register your components by the IDs authored in Contentful:

```tsx
// lib/experience-config.tsx
import {
  defineComponent,
  type Components,
  type Config,
  type ResolveToken,
  type ExperienceTemplates,
} from '@contentful/experiences-react';

import { Button } from './components/Button';
import { Heading, type HeadingProps } from './components/Heading';
import { Page } from './components/Page';

const components: Components = {
  // Keys match the segment after the last slash in `component.sys.urn`.
  // Example URN: crn:contentful:::experience:spaces/$self/environments/$self/components/Button
  //
  // Register a bare component for the common case…
  Button,
  // …or the config object when you need defaults / resolveData.
  Heading: defineComponent<HeadingProps>({
    defaults: { text: 'Untitled' },
    component: Heading,
  }),
};

const experienceTemplates: ExperienceTemplates = {
  // Optional. Keys match the last slash-segment of an `experienceTemplate` node's urn.
  page: Page,
};

// Optional. Resolves opaque design-token ids to their underlying values (see "Design tokens").
const resolveToken: ResolveToken = (token) => `var(--${token.value.replaceAll('.', '-')})`;

export const experienceConfig: Config = { components, experienceTemplates, resolveToken };
```

Fetch and render the Experience on the server:

```tsx
// app/[slug]/page.tsx (Next.js App Router)
import { fetchExperience, ServerExperienceRenderer } from '@contentful/experiences-react';
import { experienceConfig } from '@/lib/experience-config';

export default async function ExperiencePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const experience = await fetchExperience(
    { spaceId: process.env.SPACE_ID!, environmentId: 'master', experienceId: slug },
    { accessToken: process.env.CDA_TOKEN! },
    { config: experienceConfig }
  );
  return <ServerExperienceRenderer experience={experience} config={experienceConfig} />;
}
```

Components receive content and resolved design values as ordinary props. For the step-by-step walkthrough, including SvelteKit and Angular, see [Get started](https://www.contentful.com/developers/docs/experience-orchestration/experiences-sdk/get-started). A working version is at [`examples/nextjs`](./examples/nextjs).

## Live preview

The adapters subscribe to a Contentful Preview Session and keep the rendered plan in sync with canvas edits. See [Set up live preview](https://www.contentful.com/developers/docs/experience-orchestration/experiences-sdk/live-preview).

Both runtimes accept an explicit `isPreview` boolean that suppresses SDK events during preview. See the [Web](./packages/web/README.md#session-preview) and [Node](./packages/node/README.md#session-preview) contracts.

---

## Event tracking

The public Node and Web SDKs expose `identify`, `page`, and `track` through the
Personalization API. `trackView`, `trackClick`, `trackHover`, and `trackFlagView`
use the Analytics API. Web supports one live Experiences Web SDK instance per
JavaScript runtime; call `destroy()` before constructing a replacement. Node
instances do not share that lock. Experiences Web and Optimization Web are
alternative SDKs and are not supported together on one page.

Runtime constructors take Delivery and optional Preview configuration and own
their clients. A token may be a value or supplier. A tokenless trusted proxy
requires an explicit `host` and must authenticate upstream. Node event methods
belong to a `forRequest()` facade, whose locale, profile, and context are
request-local. Web owns mutable locale and browser context, persists its current
profile in LocalStorage, and offers `reset()` for logout or a new visitor
session.

Web exposes current values and subscriptions through `states`, including
`profile`, `locale`, `consent`, `persistenceConsent`, `experienceRequestState`,
`eventStream`, and `blockedEventStream`. Read `states.profile.current` or subscribe
to changes with `states.profile.subscribe(...)`; dispose the returned handle
with `unsubscribe()` during application cleanup. See the [Web state and
subscriptions reference](./packages/web/README.md#state-and-subscriptions) for
snapshot, event publication, and lifecycle semantics. Node's profile remains request-local.

Ordinary online Personalization calls send directly. Web accepts ordinary
offline calls into an in-memory queue; a new offline call is refused when the
queue is full rather than evicting accepted work. Analytics remains direct.
`destroy()` makes one best-effort attempt to drain queued batches in order, but
queued work is not durable and does not provide exactly-once delivery. Event and persistence consent are
gated by the SDK: `consent()` on Web and `consent` per request on Node. Until event
consent is granted only `allowedEventTypes` are sent, and the application decides
when to grant consent. Web's
automatic interaction tracking sends views, hovers, and clicks through its direct
Analytics methods (see the [Web SDK README](./packages/web/README.md#interaction-tracking));
Session preview gates automatic and manual tracking. CPA fetching alone does not select that policy.

An ordinary event call does not wait for every queued handoff. If a later call
needs a profile produced by `identify`, `page`, or `track`, await the earlier
call. Browser event context can include URL, query, referrer, title, dimensions,
and User-Agent; use context providers to redact those values before an event is
built or sent.

Node and Web expose `interceptors.event` to transform admitted direct events and
caller-built XDA events before destination validation and a final check of current
consent against the transformed event type. Invalid output fails schema validation;
a valid consent-blocked transformed event is reported with its final method/type.
Every event method reports admission through `EventEmissionResult`; consent refusals
return `{ accepted: false }`. Each explicit submission runs its
chain once. XDA event chains may run concurrently while preserving array order;
prepared events run sequentially. Retries and browser prepared replay reuse the
evaluated events without rerunning hooks. See the [Node interceptor reference](./packages/node/README.md#event-interceptors)
and [Web interceptor reference](./packages/web/README.md#interceptors).

### Committed server rendering and state-only hydration

For server-rendered personalized content, use the supported committed-server
sequence below. It is separate from Personalization preparation/replay and does
not provide noncommitting XDA content selection.

1. Bind a Node request to explicit consent, permitted identity, locale, and event
   context. Await one direct `request.page()` and require both its accepted result
   and an API-issued `request.profile` before identity-dependent content fetching.
2. If identification is requested, build one identify event for the cycle and
   include it in each distinct sequential XDA fetch. Do not also send it directly
   or attach the already-sent page to those fetches. Fetch each distinct Experience
   once and reuse its plan for repeated presentations. Profile-only XDA selection
   currently does not reliably apply audience membership.
3. After the final fetch, produce a state-only handoff from the final
   `request.profile`, render the plans with attribution, and safely serialize the
   minimal public configuration and handoff into a private, no-store response.
4. Construct Web with profile/consent defaults omitted. Automatic tracking starts
   on the existing attributed HTML; register manual elements immediately.
   Subscribe and adopt the final server profile through state-only hydration
   independently. Initial activation sends no page and refetches no content.

```ts
import { createRequestHandoffFromData } from '@contentful/experiences-node';

// Inside a request handler; experiences is the process-long Node SDK.
const request = experiences.forRequest({
  profile: permittedProfile,
  consent: visitorConsent,
  locale: requestLocale,
  eventContext: { page: pageProperties, userAgent },
});
const pageResult = await request.page({ properties: pageProperties });
if (!pageResult.accepted || !request.profile) {
  throw new Error('Page initialization did not establish a profile');
}
const identify = userId
  ? request.eventBuilder.buildIdentify({
      userId,
      traits: { identified: true },
    })
  : undefined;
const plans = [];
for (const experienceId of distinctExperienceIds) {
  plans.push(
    await request.fetchExperience(
      { experienceId, personalization: { events: identify ? [identify] : [] } },
      { config: experienceConfig }
    )
  );
}
const handoff = createRequestHandoffFromData({
  spaceId,
  environmentId,
  data: { profile: request.profile },
});
```

Node's `request.eventBuilder` applies request page URL/path/query/referrer, user
agent, and locale before building Personalization events. Explicit event inputs
override request context. The shared `experiences.eventBuilder` remains unbound;
fetching does not merge request context into already-built `personalization.events`.
Use the request builder rather than shared interceptor closures for visitor data.
Building sends nothing and invokes no hooks. Each identify-bearing fetch is a
separate event submission; this flow adds no duplicate-delivery guarantee.

The public Node producer accepts optional profile data and optional
`cache: { scope: 'private-request' }` (the default). It validates the explicit
space/environment scope and profile, accepts an ID-only profile, and packages no
replay or top-level continuation ID. An absent profile omits `state` and preserves
an existing browser profile on hydration. It performs no events or network work.
The internal Runtime helper of the same name takes `{ handoff, data? }` and
retains its separate replay-preserving behavior.

```ts
// In client-side lifecycle code, after safely reading the serialized handoff:
const web = new WebContentfulExperiences({
  spaceId,
  environmentId,
  delivery: publicDelivery,
});
// Defaults enable automatic views, hovers, and clicks on the existing HTML.
// Register manual elements now, using actual plan attribution in options.data.
const subscription = web.states.profile.subscribe(renderProfile);
await web.hydrateHandoffState(handoff, {
  routeKey: window.location.pathname + window.location.search,
});
// During application cleanup: subscription.unsubscribe(); web.destroy();
```

Here `WebContentfulExperiences` is the `ContentfulExperiences` export from
`@contentful/experiences-web`. Discovery starts at construction and observes
existing HTML and later DOM changes without a hydration prerequisite. Automatic
tracking, attribute opt-ins, and manual registration remain subject to consent.
Analytics needs a current profile identity when emitting an event; the constructor
can adopt persisted profile or cookie identity, and the server handoff is another
source. State-only hydration does not mark the route tracked; ordinary `page()`
remains direct.
Use the same direct page/profile step on later navigation or reset before fetching
content. An identify action joins pending initialization and explicitly refetches
without an unrelated page; a separate custom action uses `track()`.

On reset, invalidate stale application render work and remove or replace old
attributed content synchronously in the same transition, before awaiting the new
page/fetch cycle. SDK reset clears measurements and manual overrides, then resumes
eligible discovery immediately. Register replacement manual elements after
insertion; during ordinary navigation, let removed occurrences finalize before
clearing their manual registrations. Dispose subscriptions in application cleanup.
Safe serialization and preflight limitations are described below.

### Paired server-to-browser replay

A Node request facade can prepare one ordered `identify`/`track` prefix plus a
final `page` with `prepareRequestHandoff()`. It builds the events once and sends
one Personalization API request with `preflight: true`, which evaluates the
batch without committing it on Node. The result contains the exact evaluated replay and,
on success, preview data. Hook/schema failures or an invalid/blocked final page
produce an event-free handoff; blocked optional prefix events are omitted.
A preview transport failure retains the evaluated replay so the
application can choose a fallback. Ordinary Node event methods remain direct
and are not staged into this batch.

```ts
import { ContentfulExperiences as NodeContentfulExperiences } from '@contentful/experiences-node';

// Construct once for this server runtime; supply the token for your environment.
const experiences = new NodeContentfulExperiences({
  spaceId: 'your-space-id',
  environmentId: 'master',
  delivery: { accessToken: process.env.CONTENTFUL_DELIVERY_TOKEN! },
});

// In a request handler, bind request-local state and prepare one route:
const request = experiences.forRequest({
  locale: 'en-US',
});
const routeKey = '/products?category=chairs';
const { handoff, data } = await request.prepareRequestHandoff({
  routeKey,
  initialEvents: [{ type: 'track', event: 'experience_rendered' }],
  page: { properties: { title: 'Chairs' } },
});
// Serialize the handoff into this visitor's private, no-store response.
```

The application supplies a route key made from the visible pathname and search
string. It must begin with `/`. A handoff with profile, continuation identity,
or replay uses `cache: { scope: 'private-request' }`. A profileless public or
static handoff can carry state without event replay; a public permutation
requires an application-owned key covering every dimension that changes the
rendered Experience. The handoff parser checks these metadata rules but does
not set HTTP cache headers or certify the rest of a response.

On the browser, call `hydrateAndTrackCurrentPage()` on an existing Web instance.
Construction does not replay events. A matching replay is validated and
admitted as one batch; the promise settles on **admission**, before HTTP
completes. Repeated calls for the current handoff and route join that work.
A different handoff or a later visit can track again. A route mismatch skips
its evaluated state and replay, then follows ordinary current-page tracking.
A rejected prepared batch (including invalid events or insufficient capacity)
quietly falls back to one ordinary `trackCurrentPage()` attempt using the supplied
`buildPayload`, or the default page payload. The operation returns that attempt's
result and respects route deduplication, capacity, and lifecycle guards. An
accepted replay never falls back because of a later HTTP failure.

```ts
// Browser runtime, after reading the handoff from that response:
import {
  ContentfulExperiences as WebContentfulExperiences,
  type ExperiencesHandoff,
} from '@contentful/experiences-web';

const web = new WebContentfulExperiences({
  spaceId: 'your-space-id',
  environmentId: 'master',
  delivery: { host: 'https://application.example/experience-proxy' },
});

async function applyHandoff(handoff: ExperiencesHandoff) {
  const routeKey = window.location.pathname + window.location.search;
  const result = await web.hydrateAndTrackCurrentPage(handoff, { routeKey });
  return result; // accepted means admitted, not delivered
}
```

Event-only handoff preparation and hydration need no component registry. When
the same SDK fetches or resolves an Experience plan, pass that Experience's
registration config in the call's resolve options, for example
`web.fetchExperience({ experienceId }, { config: experienceConfig })`. Separate
calls may use different configs on the same SDK instance.

`hydrateHandoffState(handoff, { routeKey })` can seed state before tracking and
joins a later paired call for the same current initialization.
`trackCurrentPage({ routeKey, buildPayload })` handles ordinary navigation;
its callback receives `isInitialEmission`. Manual `page()` remains direct and
is not deduplicated. At the beginning of a still-current initialization, the
active browser profile or an already adopted continuation takes precedence over
the incoming handoff ID. Selection and publication happen atomically. An
initialization superseded before it begins adopts nothing; once published, its
continuation is retained across navigation. Supersession still cancels pending
hydration/replay and does not withdraw accepted queued work. Reset/destroy and
legitimate profile updates retain their existing behavior. Before the
Personalization response finishes, the adopted ID can attribute events without
being stored as a synthetic profile. Concurrent `fetchExperience()` calls join
identity initialization without waiting for replay HTTP; evaluated profile-state
hydration remains distinct from the captured replay target.

Handoffs containing event bodies are browser-visible private data. Escape JSON
for the HTML context used by your framework, send it only in a private,
`Cache-Control: private, no-store` response, and exclude secrets and server-only
traits. Do not put handoffs in shared caches, logs, or persistent storage. A
plain `JSON.stringify` result inserted unescaped into a `<script>` element is
not an HTML-safe serializer. A `PortableRenderPlan` can also contain diagnostic
values that JSON does not preserve; applications transporting a plan should
check their own round trip. The SDK does not install response headers or supply
a framework serializer.

Prepared batches stay in Web's in-memory queue on transport failure and retry
with their original event IDs, target identity, and locale. A request may have
committed before a failure becomes visible, so retries do not guarantee
exactly-once delivery. Web queues Analytics calls separately in memory; there is no mixed
Personalization/Analytics replay journal or global ordinary-event barrier.
No adapter or example currently wires this flow, and Live Preview remains
independent.

The current XDA client has no noncommitting preflight option. A separate
Personalization preflight does **not** make an XDA fetch render content with
those uncommitted mutations. An ordinary event-bearing XDA fetch still uses its
current POST contract and may commit the events; independently using both
operations can duplicate them. This SDK adds no interim suppression or fake
XDA content preview. Typed XDA preflight and a content-and-handoff operation
will be integrated after upstream support is available, before public release.

---

## Examples

Runnable apps for all three frameworks live in [`examples/`](./examples). They register the same components against the same Experience payload, so they render identically; only the framework-specific setup differs.

| Example                                      | Stack                       | Shows                                                                                                   |
| -------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------- |
| [`examples/nextjs`](./examples/nextjs)       | Next.js 15 (App Router)     | Preview mode, async `resolveData`, design tokens, styling hooks                                         |
| [`examples/sveltekit`](./examples/sveltekit) | SvelteKit 2 + Svelte 5      | 1:1 parity with the Next.js app                                                                         |
| [`examples/angular`](./examples/angular)     | Angular 20 + `@angular/ssr` | Same, on zoneless Angular; fetch in Express (keeps tokens server-side) + `TransferState` relay          |
| [`examples/astro`](./examples/astro)         | Astro 7 + `@astrojs/react`  | Custom renderer with `@contentful/experiences-react/custom-renderer`: native islands, static by default |

The examples render the same demo Experience. To run them you first seed that Experience into your Contentful space with the one-time bootstrap script — the script uses the experiences management API to provision the ContentType, entries, assets, design tokens, Components, Experience Template, DataAssemblies, and the Experience itself.

```sh
npm install --ignore-scripts
npm run build                          # build the SDK packages

# 1. Seed the demo Experience into your Contentful space (one-time).
cd examples/scripts
cp .env.example .env                   # fill in SPACE_ID, ENVIRONMENT_ID, CMA_TOKEN
npm run bootstrap                      # prints the experienceId at the end (default: `landing`)

# 2. Run one of the example apps against the seeded space.
cd ../nextjs                           # or ../sveltekit, ../angular, ../astro
cp .env.example .env.local             # sveltekit uses .env; fill in SPACE_ID, ENVIRONMENT_ID, CDA_TOKEN
npm run dev
```

Then visit `/landing` (or whichever experienceId the bootstrap printed). See each example's README for its file map and route-by-route walkthrough.

**Tokens.** `CMA_TOKEN` is a Personal Access Token that only the bootstrap script sees. `CDA_TOKEN` is a Content Delivery API token — this is what the running app uses at runtime. `CPA_TOKEN` is a Content Preview API token, only needed if you want to exercise `?preview=true`; see each example's README for details.

---

## Workspace internals

This is an Nx monorepo. Install the framework adapter for rendering. `@contentful/experiences-node` is public for Node request handlers and other server processes, including request-bound event delivery; `@contentful/experiences-web` is public for browser fetch, resolve, and direct event work; and `@contentful/experiences-live-preview` is public for framework-neutral Preview Session use. The remaining packages are workspace-internal.

| Folder                                                   | npm name                               | Scope                                                                                                                  |
| -------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [`packages/core`](./packages/core)                       | `@contentful/experiences-sdk-core`     | **Internal.** Runtime-neutral types + `resolveExperience`.                                                             |
| [`packages/design`](./packages/design)                   | `@contentful/experiences-design`       | **Internal.** CSS-property helpers for `toCss`.                                                                        |
| [`packages/client`](./packages/client)                   | `@contentful/experiences-client`       | **Internal.** Generated Delivery boundary, XDA request types, and free fetch functions.                                |
| [`packages/runtime`](./packages/runtime)                 | `@contentful/experiences-runtime`      | **Internal.** Shared runtime, `EventBuilder`, event metadata, Optimization transport, and handoff contract.            |
| [`packages/node`](./packages/node)                       | `@contentful/experiences-node`         | **Public.** Node SDK with request-scoped fetch, resolve, and event operations.                                         |
| [`packages/web`](./packages/web)                         | `@contentful/experiences-web`          | **Public.** Web SDK with browser-owned locale/context, persisted profile, direct events, and prepared-batch admission. |
| [`packages/live-preview`](./packages/live-preview)       | `@contentful/experiences-live-preview` | **Public.** Framework-neutral Preview Session client.                                                                  |
| [`packages/adapter-react`](./packages/adapter-react)     | `@contentful/experiences-react`        | **Public.** React renderer + re-exports of everything else.                                                            |
| [`packages/adapter-svelte`](./packages/adapter-svelte)   | `@contentful/experiences-svelte`       | **Public.** Svelte 5 renderer with the same public API shape.                                                          |
| [`packages/adapter-angular`](./packages/adapter-angular) | `@contentful/experiences-angular`      | **Public.** Angular renderer (`^20 \|\| ^21 \|\| ^22`) with the same public API shape.                                 |

Future framework adapters slot in under the same pattern (`packages/adapter-vue`, and so on) and consume the same internal core and design packages. The Web SDK is a sibling public package to the Node SDK over Runtime, Client, and Core; it owns browser state and does not inherit Node request semantics.

```sh
npm install --ignore-scripts        # husky prepare can fail in fresh clones; safe to skip

npm run build                       # nx run-many -t build (topological)
npm test                            # nx run-many -t test
npm run lint                        # nx run-many -t lint
npm run typecheck                   # nx run-many -t typecheck
npx nx graph                        # visual dep graph
npm run release:dry                 # rehearse independent release
```

### Local npm artifacts

Build and pack the SDK packages for use by standalone reference implementations:

```sh
npm run build:pkgs                   # all publishable packages under packages/*
npm run pack:pkgs                    # same pipeline; reuses valid Nx build caches
npx nx run node:pack                 # optional: only Node and its local dependencies
```

`build:pkgs` is the counterpart to Optimization's suite-wide build-and-pack
workflow. The per-project `node:pack` command is an additional Nx convenience:
it prepares only Core, Client, Runtime, and Node, using the same pack tasks and
archive format as the suite-wide command. It does not install or start the Node
reference implementation.

Nx builds dependencies first and runs the existing release-artifact checks for
Runtime, Node, and Web before packing them. Packing is uncached and writes to the
ignored `pkgs/` directory: each package has its npm-generated versioned filename
and a stable alias such as `contentful-experiences-node-local.tgz`. Each task
replaces only its own archives; older versioned files can remain in `pkgs/`.
The stable alias is replaced only after a complete archive passes entry-point
checks; failures stop the command.

The helper runs `npm pack` against each package's publication files and checks
that its exported entry points are included. It preserves package manifests,
including dependency ranges, scripts, and devDependencies, so local artifacts
exercise the same metadata as publication. Lifecycle scripts are disabled during
packing; Nx performs the required builds explicitly. These commands do not change
versions, publish to a registry, or install a reference implementation.

Run the packaging helper's checks with `npx nx test package-tools` and
`npx nx lint package-tools`. They also participate in the root test/lint commands.

After SDK changes, refresh all standalone reference implementations together:

```sh
npm run implementation:install
```

This runs each implementation's existing `setup` target: build and pack its SDK
dependency chain, reinstall its local packages, and build browser assets where
applicable. It preserves existing app-local `.env` files and does not start apps.
Stop running reference apps with their scoped `serve:stop` targets before this
dependency refresh, then relaunch them with `serve` or `dev`. Focused per-app
`setup` targets remain available. The CI Build job prepares all implementations
and runs their lint/typecheck targets after the SDK build.

The [standalone Node reference implementation](./implementations/node-sdk/README.md)
uses these artifacts with its own dependencies and `.env`. Prepare it with
`npx nx run implementation-node-sdk:setup`, then run
`npx nx run implementation-node-sdk:dev`. Root aggregate checks exclude
implementations; their README documents the explicit Nx commands.

The [standalone Web reference implementation](./implementations/web-sdk/README.md)
uses the packed Web UMD distribution with browser-owned state and direct live
delivery. Run `npx nx run implementation-web-sdk:setup`, then
`npx nx run implementation-web-sdk:dev`. Its README covers local environment
configuration, consent, interaction tracking, and scoped validation commands.

The [standalone Node + Web reference implementation](./implementations/node-sdk+web-sdk/README.md)
renders initial Experience content through Express/EJS, adopts final server profile
state in the browser, and supports Web SDK navigation and interactions. Run
`npx nx run implementation-node-sdk-web-sdk:setup`, then
`npx nx run implementation-node-sdk-web-sdk:dev`. Its README distinguishes consumer
integration from demo UI and optional browser-attempt diagnostics.

Root PM2 shortcuts match Optimization: `npm run pm2:list`, `npm run pm2:logs`,
`npm run pm2:stop:all`, and `npm run pm2:delete:all`. The `all` commands affect
every process in the selected PM2 home. Use the implementation's scoped stop
target when managing only one reference app.

For deeper context (design decisions, multi-framework architecture notes, conventions, and gotchas), see [`AGENTS.md`](./AGENTS.md).

---

## Contributing

Contributions are welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for development setup, coding standards, and the PR process, along with our [Code of Conduct](https://github.com/contentful/.github/blob/master/CODE_OF_CONDUCT.md).

## Support

For usage questions and support, [visit the Contentful support center](https://support.contentful.com/hc/en-us). Use [GitHub issues](https://github.com/contentful/experiences/issues) for bugs and feature requests.

## License

MIT. See [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE).

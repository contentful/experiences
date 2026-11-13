# Next.js example: Contentful Experiences

A Next.js 15.5 App Router app demonstrating the managed `@contentful/experiences-nextjs` server and client bindings. Pages are served from a **Destination**: the URL path is the Destination path, and the SDK resolves it to an Experience. Fetching by Experience id is available as a secondary route.

## What it shows

- **Destinations as the primary route**: the server binding selects `{ destinationId, path, locale }` from the incoming request URL. `/` renders the home node; `app/[...path]/page.tsx` handles other paths. Bound components follow Destination redirects with native Next navigation, and the page maps `NotFoundError` to `notFound()`. Personalized requests render dynamically with private fetches.
- **A demo hub at `/`**: `app/page.tsx` explains the example, has the personalization and debug checkboxes, lists every route with its options, and renders the Destination's home Experience below.
- **By Experience id as the secondary route**: `app/experiences/[id]/page.tsx` selects one Experience by id. It demonstrates Preview Sessions and by-ID runtime parameters.
- **Managed server fetch and resolve**: `bindAppRouterServerExperiences` owns one primary load, request lifetime and hybrid handoff. A shared registry retains the existing component resolvers and design tokens.
- **Server evaluation with browser-managed presentation**: the server binder injects the client binding's request root and `Experience`. The complete serialized result supplies the initial SSR content and browser adoption without a duplicate startup content fetch.
- **Managed Live Preview**: `preview_session_id` activates the configured Preview capability. The client binding installs the optional synchronous `createLivePreviewClient` factory and owns updates and session transitions.
- **Runtime parameters via `?parameter_demo=true`**: a JSON form forwards scalar/Record values to `fetchExperience`; submitting changed values refetches and renders a new plan.
- **Debug mode via `?debug=true`**: the top-level `debug` flag turns on verbose SDK logging, flips `MissingComponent` to a visible box, and auto-mounts `<DebugExperience>` (a collapsible JSON dump of the resolved plan) above the tree.
- **Async `resolveData` with external fetch**: the `card` component demonstrates enrichment (fake catalog lookup) plus metadata-aware URL rewriting; resolvers run in parallel across nodes.
- **Design values as props** (spacing, color, typography, layout): every component declares the design keys it consumes as **named props** and destructures them. That is the recommended styling contract, and it's what all nine components here do. Don't collect leftovers with `...rest` and forward them to a DOM element — design keys are camelCase prop names, not HTML attributes, so React warns and they land in the markup as junk.
- **One escape-hatch demo**: `components/Card.tsx` styles itself from props like the rest, but its nested `CardCta` child — not a registered component, so it has no props of its own — reads the card's design off context with **`useDesignValues()`**. That's the case props can't cover.
- **Design tokens**: `lib/experience-config.tsx` wires a `resolveToken` that maps token ids (`size.xl`, `color.text`, and so on) to CSS values from `lib/design-tokens.ts`.
- **Component registration**: bare components for the common case, a typed `ComponentConfig<Props>` when a component needs `defaults` or `resolveData`. Type-only adapter imports keep the shared registry usable on both server and browser; the authoring helper is an alternative illustrated below.

## Run it

The example is a real integration against Contentful, not a mock. You need:

1. **A Contentful space** with the demo content model + Experience seeded into it (a one-time step below), and
2. **Tokens** for the paths you want to hit — different Contentful APIs use different tokens.

The [`examples/scripts/bootstrap-example.ts`](../scripts/bootstrap-example.ts) script does the seeding via the management API. See [`examples/scripts/README.md`](../scripts/README.md) for what it provisions.

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
cd ../nextjs
cp .env.example .env.local             # fill in private and NEXT_PUBLIC_* configuration
npm run dev
```

`DESTINATION_ID` is server-generated. The bootstrap prints it at the end; paste it into `.env.local`.

Visit `http://localhost:3000/` (the Destination's home node, the `home` Experience) and `http://localhost:3000/demo/landing` (the `landing` Experience). `/welcome` is a redirect node that sends you back to `/`. The server binding reads Delivery using `CDA_TOKEN`; the managed client presentation adopts its full result. Set `NEXT_PUBLIC_SPACE_ID`, `NEXT_PUBLIC_ENVIRONMENT_ID` and `NEXT_PUBLIC_CDA_TOKEN` explicitly for the browser owner. These have no fallback to private credentials.

### Optional: runtime parameters

Open `/experiences/<experience-id>?parameter_demo=true` to show the parameter form. Enter a
JSON object using IDs declared in that Experience's `parameters`, then click
**Refetch Experience**. The GET form reloads the same route with new values;
the managed server binding evaluates a fresh result and the client root adopts its newly resolved plan.
Existing locale, debug and personalization query options are preserved.

For an Experience declaring a String parameter `categorySlug`, try
`{"categorySlug":"technology"}`, then change it to `{"categorySlug":"culture"}`.

For an Experience declaring a Record parameter `featuredPosts` and a collection
binding referencing `$parameters/featuredPosts`, try:

```json
{ "featuredPosts": { "limit": 6, "order": "-fields.title" } }
```

Change `limit` to `12` and `order` to `fields.title`, then refetch to show more
entries sorted ascending. Order is one signed `fields.<apiName>` or `sys.<id>`
path. Delivery validates declared names, requiredness, fallbacks and values.
The bootstrap's `landing` Experience has no such declarations; use an Experience
with the matching parameter and collection binding already configured.

The request selector passes the parsed map as its `parameters` option.
GET delivery requests encode Record leaves as `parameter.featuredPosts.limit`
and `parameter.featuredPosts.order`; personalization or an empty Record selects
POST automatically. The form's JSON lives in the page URL, so use public content
selectors here. This example keeps the server-side delivery token off the form.

A Preview Session uses its server-owned `context.parameters` and WebSocket updates: the route ignores
the form's parameters and hides its controls while a live session is active.

### Optional: personalization

The bootstrap seeds everything needed: the `Landing (developers)` Optimization
Variant, an EU audience (`demo-audience-developers`), and an Optimization
(`demo-optimization-developers`) that serves the variant to that audience.
Nothing has to be configured in Contentful by hand.

Tick **Simulate an EU visitor** on the hub at `/` and click Apply, or open
`http://localhost:3000/demo/landing?personalization=true` (or
`/experiences/landing?personalization=true`). The existing query name is retained.
The server binding's `request.pagePayload` adds Berlin/DE/EU location to the
SDK-built automatic page; it does not construct events or reconstruct request
URLs. Without the flag, the automatic page still runs with ordinary request
metadata. The switch changes audience input, not whether the page is tracked.

This is a location simulation. The seeded EU audience can select the developer
hero; an existing visitor profile may also affect selection. The SDK's public `createPageContext` helper preserves URL, referrer and query
properties from the sanitized request context while the payload adds title and
optional simulated location. `?locale=de-DE` selects content/resolver locale,
the automatic page payload locale and the managed browser owner's locale. Hybrid mode (the default)
evaluates the page on Node with `preflight: true`, then the browser admits the
prepared replay and commits it through the Personalization API. Preview Sessions
suppress events. Consent remains SDK-gated; admission is not a service commitment
receipt.

The example has no server consent-management platform: `consent.server: false`
permits only the default allowlist, including page. It does not infer server
consent from a cookie or browser state. Browser consent choices below belong to
the managed Web owner. Production apps should supply their actual server consent
policy. Known upstream Destination source-map and profile-finalization gaps are
tracked in the [Runtime destination limits](../../packages/runtime/README.md#destination-selection);
the example does not invent attribution or emulate service commitment.

### Optional: consent

Each managed page renders a **Consent demo** panel under its request root:

- **Accept all / Reject all / Events only** use the adapter's public consent action hook.
- The panel reads live consent, persistence consent, profile and latest blocked
  event through public state hooks. It keeps only the last manual action result
  in local UI state.
- **Send another page** is an explicit additional page action; initial page
  sequencing belongs to the binding. **Send demo track** demonstrates a consent
  refusal when track is not permitted by consent or the allowlist.
- With _Events only_, the profile may remain in memory while persistence is
  disabled. Browser consent decisions use the SDK's shared LocalStorage keys.
- Session preview suppresses manual and automatic events independently of socket
  connection status.

The panel shares the managed browser SDK; it creates no separate runtime and has
no fake Analytics attribution buttons. Real interaction attribution comes from
rendered plan containers and node attributes through the SDK's tracking path.

### Optional: live preview

Set both server `CPA_TOKEN` and browser-designated `NEXT_PUBLIC_CPA_TOKEN`, then
open `/experiences/landing?preview_session_id=<session-id>`. Contentful supplies
the session ID. The server and client bindings select Preview policy from the
incoming URL and own snapshot acquisition, subscriptions, event suppression and
session changes. Blank IDs are ignored. The server plan renders immediately;
managed presentation receives matching updates without a hydration gate.

The by-ID route demonstrates preview; Destination acquisition remains available
through the SDK when a session is active. Active sessions own locale and
parameters, so the selector omits those overrides and the by-ID form is hidden.
The browser token is intentionally public; use an approved token and CORS policy
or configure an authenticated trusted proxy in the client binding. Private
credentials are never silently promoted into browser configuration.

### Tokens summary

| Token                   | API                | Used by                              | Required?                             |
| ----------------------- | ------------------ | ------------------------------------ | ------------------------------------- |
| `CMA_TOKEN`             | Content Management | The bootstrap script (one-time seed) | Yes, to run bootstrap                 |
| `CDA_TOKEN`             | Content Delivery   | The example app                      | Yes, to run the app                   |
| `CPA_TOKEN`             | Content Preview    | Server Preview snapshots             | Only for Preview Sessions             |
| `NEXT_PUBLIC_CDA_TOKEN` | Content Delivery   | Managed browser owner                | Yes                                   |
| `NEXT_PUBLIC_CPA_TOKEN` | Content Preview    | Managed browser Preview connection   | Only for interactive Preview Sessions |

## The routes

The hub at `/` links to all of these. The managed server binding evaluates one primary result and its client request presentation renders it.

| Try it locally                                                              | Source                                                             | Notes                                                                       |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `http://localhost:3000/`                                                    | [`app/page.tsx`](./app/page.tsx)                                   | Demo hub plus the Destination home node (shared `lib/destination-page.tsx`) |
| `http://localhost:3000/demo/landing`                                        | [`app/[...path]/page.tsx`](./app/[...path]/page.tsx)               | Destination path                                                            |
| `http://localhost:3000/welcome`                                             | same route                                                         | Redirect node: `redirect()` back to `/`                                     |
| `http://localhost:3000/demo/landing?personalization=true&debug=true`        | same route                                                         | personalized page event plus SDK debug output                               |
| `http://localhost:3000/experiences/landing`                                 | [`app/experiences/[id]/page.tsx`](./app/experiences/[id]/page.tsx) | By Experience id                                                            |
| `http://localhost:3000/experiences/landing?preview_session_id=<session-id>` | same route                                                         | [`lib/experience-client.tsx`](./lib/experience-client.tsx)                  |

The request selector is bound once in `lib/experience-server.tsx`; the same
binding handles Destination and by-ID routes. `middleware.ts` uses the SDK's Node
context-only handler to sanitize and forward the actual request URL. It never
loads content or submits events. Next.js 15.5 is the middleware runtime floor.

```tsx
// lib/experience-server.tsx (configuration abbreviated)
export const binding = bindAppRouterServerExperiences(serverOptions, {
  request: { ExperiencesRoot: ClientRoot, Experience: ClientExperience },
});
export const { ExperiencesRoot, Experience } = binding.request;

// lib/destination-page.tsx — shared page composition
const result = await binding.request.loadExperience();
if (result.error instanceof NotFoundError) notFound();
return (
  <ExperiencesRoot locale={result.experience.locale}>
    <Experience />
    <ConsentPanel />
  </ExperiencesRoot>
);
```

The loader and both bound components share the same request-memoized result.
The convenience components serialize and forward that complete result, including
its `requestId`, handoff, source descriptor and usable plan/error; the client
`Experience` inherits the same root result. Native redirects are handled before
browser adoption. There is no application SDK constructor, request facade,
manual event builder, route synchronization or separate preview wrapper.

This example deliberately uses a **page-scoped owner**. Each page renders its
request root with its fresh server result; `app/layout.tsx` contains only the
HTML shell. Navigation retains the existing request root when React reuses the
page composition and otherwise destroys it and creates the next owner. Only one
live browser owner is mounted. A remount resets in-memory queues, subscriptions
and flag exposure history; consent and permitted identity persistence follow the
SDK's storage policy. An application requiring continuous owner lifetime can
use the adapter's documented stable root composition while updating its complete
result on navigation.

All content routes are `force-dynamic`; they are not public SSG or ISR. The free
`fetchDestinationSitemap` helper remains the right API to enumerate routes for a
separate sitemap or explicit public/static integration. It neither owns this
personalized request nor turns private request results into public cache entries.
See the [managed adapter guide](../../packages/adapter-nextjs/README.md#automatic-single-experience-setup)
for server-only rendering, static rendering and other compositions.

An empty-nodes payload (draft, unpublished, or empty locale) resolves to a plan with `nodes: []` and renders as an empty page — not a 404.

## File map

```
examples/nextjs/
├── app/
│   ├── layout.tsx                       # root layout
│   ├── page.tsx                         # demo hub at `/` + the Destination home node
│   ├── [...path]/page.tsx               # primary: managed Destination path, redirects, 404
│   └── experiences/[id]/page.tsx        # secondary: by Experience id; Preview Sessions, parameters
├── components/                          # design-system components; design arrives as props
│   ├── Section.tsx                      # flex/grid layout primitive; design as named props
│   ├── Heading.tsx
│   ├── Text.tsx
│   ├── RichText.tsx                     # minimal rich-text renderer
│   ├── Image.tsx
│   ├── Button.tsx
│   ├── HeroPlain.tsx                    # composed component, content from a DataAssembly
│   ├── Card.tsx                         # ditto; nested CardCta demos the useDesignValues() escape hatch
│   └── Page.tsx                         # registered as a coded Experience Template
└── lib/
    ├── design-tokens.ts                 # token id to CSS value table (used by resolveToken)
    ├── experience-config.tsx            # shared typed registry + async resolveData + tokens
    ├── experience-server.tsx            # server binding, request selector, page payload
    ├── experience-client.tsx            # client binding, public credentials, Preview factory
    ├── destination-page.tsx             # managed page root/presentation and native 404
    └── page-options.ts                  # URL flags and parameter JSON envelope
```

## Integration pattern

The example separates **two layers**:

1. **Design-system components** (`components/Section.tsx`, `components/Heading.tsx`, …) receive their **content** props (`text`, `label`, `src`) plus their **resolved design** props (`backgroundColor`, `gap`, `align`, …) together, and style themselves from those props. Each one names the design keys it consumes in its own props interface. Since they import nothing SDK-shaped and are just functions of their props, they're easy to unit-test and render in isolation.
2. **The experience config** (`lib/experience-config.tsx`) is the integration layer: it maps each `componentId` to a component (bare, or a typed config for `defaults` / `resolveData`), maps `experienceTemplateId`s under `experienceTemplates`, and wires `resolveToken`. It composes into the single `experienceConfig` object the renderer takes.

Why split this way: SDK-shaped concerns (registration, defaults, async resolvers, token resolution) all live in one file you can scan to understand the whole integration surface.

```tsx
// components/Heading.tsx: content prop + design keys declared as props
'use client';

export function Heading({ text, as = 'h2', fontSize, fontWeight }: HeadingProps) {
  const Tag = as; // semantic key, read by name
  return <Tag style={{ fontSize, fontWeight }}>{text}</Tag>;
}
```

```tsx
// components/Section.tsx: design keys declared as props, no SDK import at all
'use client';

export function Section({ direction = 'column', gap, backgroundColor, children }: SectionProps) {
  // Destructure the keys you use. Don't gather `...rest` and spread it onto a
  // DOM element — design keys are camelCase prop names, not HTML attributes.
  return (
    <div style={{ display: 'flex', flexDirection: direction, gap, backgroundColor }}>
      {children}
    </div>
  );
}
```

The following authoring-helper form is an equivalent alternative for a server-only
registry; the runnable shared registry uses type-only imports and a typed config
so browser code does not import the server entry.

```tsx
// lib/experience-config.tsx: adapter layer
import {
  defineComponent,
  type Config,
  type ResolveToken,
} from '@contentful/experiences-nextjs/server';
import { Heading } from '@/components/Heading';
import { Page } from '@/components/Page';
import { designTokens } from '@/lib/design-tokens';

const components = {
  Heading: defineComponent<{ text?: string }>({
    defaults: { text: 'Untitled' },
    component: Heading,
  }),
  // ... other component types (bare or config) ...
};

const experienceTemplates = { page: Page };

const resolveToken: ResolveToken = (token) => designTokens[token.value];

export const experienceConfig: Config = { components, experienceTemplates, resolveToken };
```

### Merge precedence

The component receives a set of props composed of (last-wins):

1. `defaults` (componentConfig.defaults, fallback values)
2. resolved design values (run through `resolveToken`)
3. `contentProperties` (editorial values from the payload)
4. `resolveData()` (return value of componentConfig.resolveData, see below)
5. slot props (each named slot becomes a pre-rendered React subtree)

So a payload like:

```json
{
  "component": { "sys": { "urn": ".../components/Button" } },
  "contentProperties": { "label": "Click me", "url": "example.com/go" },
  "designProperties": { "target": { "type": "ManualDesignValue", "value": "_self" } }
}
```

reaches your `Button` as `{ target: '_self', label: 'Click me', url: 'https://example.com/go' }` (after its `resolveData` runs). The same `{ target: '_self' }` is what `useDesignValues()` would return, so both see identical values — declare `target` as a prop, which is what this app does.

### `resolveData`: sync or async transforms

Each entry can declare a `resolveData` hook that derives final props from the
raw inputs. Useful for reshaping editorial fields, fetching enrichment, or
localizing URLs. The result is merged in **after** content but **before**
slots.

```tsx
PriceTag: defineComponent<PriceTagProps>({
  resolveData: async ({ content }) => ({
    formattedPrice: await formatPriceFromCatalog(content.sku),
  }),
  component: PriceTag,
}),
```

The managed binding performs fetching and resolution. The equivalent free-function API remains available for explicit integrations:

```ts
const result = await fetchExperience(
  {
    spaceId: process.env.SPACE_ID!,
    destinationId: process.env.DESTINATION_ID!,
    path: '/demo/landing',
  },
  { accessToken: process.env.CDA_TOKEN! },
  { config: experienceConfig }
);
```

Resolvers run in parallel across nodes.

#### Optional `metadata` + `debug`

Two top-level `resolveOptions` (the third arg) tune resolve + render. Both are
optional and default off; production usually needs neither.

- **Per-page metadata**: `metadata: { slug, locale }` is passed into every
  component's `resolveData` hook (as `ctx.experience.metadata`) and readable at
  render time via `useExperience().metadata` — for URL building, locale-aware
  lookups, and so on.
- **Debug mode**: `debug: true` turns on verbose SDK logging, flips
  `MissingComponent` to a visible box, and auto-mounts `<DebugExperience>`. It's
  independent of Preview Sessions.

```ts
const experience = await fetchExperience(
  { spaceId: process.env.SPACE_ID!, environmentId: 'master', experienceId: slug, locale },
  {
    accessToken: process.env.CDA_TOKEN!,
  },
  {
    config: experienceConfig,
    metadata: { slug, locale },
    debug,
  }
);
```

### `defineExperienceTemplate`: coded Experience Templates

A coded Experience Template is an **ordinary node** in the experience — one whose
ref is `experienceTemplate` rather than `component`, so the SDK resolves its id
against `Config.experienceTemplates` instead of `Config.components`. Everything
else is identical: the same `defaults` / `resolveData` shape, and slots arrive as
props named after the slot. A template with a `content` slot receives a
`content: ReactNode[]` prop and renders the page layout around it.

A composite experience has no template node — its nodes are plain components and
nothing wraps them. `payload.sys.experienceTemplate` is never read; it is present
in both cases, so the node list is what distinguishes them.

```tsx
import { defineExperienceTemplate } from '@contentful/experiences-nextjs/server';
import { Page } from './Page';

const experienceTemplates = {
  // bare component, or defineExperienceTemplate({...}) for defaults / resolveData
  page: defineExperienceTemplate<PageProps>({
    defaults: { title: 'Welcome' },
    component: Page, // Page receives { title, content } — `content` is its slot
  }),
};

export const experienceConfig: Config = { components, experienceTemplates };
```

If the payload references an experience-template id that isn't registered, the renderer
warns once and renders the nodes unwrapped, the same graceful-degradation
behavior as missing components.

The client binding configures `preview` with `NEXT_PUBLIC_CPA_TOKEN` and
`createLivePreviewClient`; the server binding uses private `CPA_TOKEN` separately.
Managed roots own Preview mode and session transitions from the URL. Preview
suppresses events even when event consent is granted, independently of socket
status. Debug mode remains a separate renderer option.

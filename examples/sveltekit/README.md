# SvelteKit example: Contentful Experiences

A SvelteKit 2 + Svelte 5 app demonstrating `@contentful/experiences-svelte` rendering an Experience payload fetched from XDA. Mirrors `examples/nextjs/` 1:1 in registered components, slugs, and visual output; the only thing that changes between the two apps is the framework-specific setup.

## What it shows

- **Server-side fetch and resolve** via `fetchExperience` re-exported from `@contentful/experiences-svelte`, which proves the fetch and resolver pipeline is genuinely framework-agnostic.
- **SSR rendering** with `ServerExperienceRenderer` from `@contentful/experiences-svelte`.
- **Live preview via `preview_session_id`**: the route keeps the server-fetched plan for the first render, then `useLivePreview` applies Preview Session updates in the browser.
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
npm run bootstrap                      # prints the experienceId at the end (default: `landing`)
```

### 2. Run the app

```sh
cd ../sveltekit
cp .env.example .env                   # fill in SPACE_ID, ENVIRONMENT_ID, CDA_TOKEN
npm run dev
```

Visit `http://localhost:5173/landing`. `landing` is the Experience id the bootstrap printed; any other Experience id in your space works too.

### Optional: personalization

The bootstrap seeds everything needed: the `Landing (developers)` Optimization
Variant, an EU audience (`demo-audience-developers`), and an Optimization
(`demo-optimization-developers`) that serves the variant to that audience.
Nothing has to be configured in Contentful by hand.

Tick **Personalization** on the home page, or open
`http://localhost:5173/landing?personalization=true`, to see the developer
hero. Without the flag you get the base hero.

With `?personalization=true` the server builds a server-channel page event with
`EventBuilder`, stamps an EU location on it, and sends it in `fetchExperience`'s
first-class `personalization` option. That switches the XDA request to POST, so
Contentful evaluates the visitor against the audience and hydrates the selected
hero before server rendering. Without the flag no event is sent and the request
is unchanged.

This is a simulation, not geo-targeting: XDA takes the visitor's location from
the event (not the request IP) and defaults to San Francisco (US) when none is
sent. The example sends Berlin whenever the box is ticked, so every tester sees
the same result regardless of where they are. A real app would send the
visitor's actual location.

The example intentionally does not implement durable profile storage or consent
policy; production applications must own those concerns.

### Optional: consent

Every page shows a **Consent demo** panel (bottom right), rendered by `src/routes/+layout.svelte`. It creates an `@contentful/experiences-web` runtime in the browser, on mount, and lets you watch consent gating work:

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

The panel reuses `SPACE_ID`, `ENVIRONMENT_ID` and `CDA_TOKEN`. `src/routes/+layout.server.ts` reads them and returns them to the layout. The delivery token
reaches the browser, so use a read-only delivery token. The panel only sends events
and never fetches an Experience.

The interaction buttons send a fixed demo entity. The panel also starts
`startInteractionTracking()`, but no rendered node is stamped for it yet, so views,
hovers and clicks on the page are not tracked automatically. Stamping rendered nodes
is waiting on the scope-based attribution in
[#225](https://github.com/contentful/experiences/pull/225), which replaces
`data-ctfl-node-id`.

### Optional: preview mode

Add `CPA_TOKEN=...` (Content Preview API token from **Settings → API keys** in your space) to `.env`, then visit `http://localhost:5173/landing?preview=true`. The route reads from `preview.xdn.contentful.com`, which needs a preview token — a CDA token gets rejected there.

The route ([`src/routes/[slug]/+page.server.ts`](./src/routes/[slug]/+page.server.ts)) wires this through `fetchExperience`'s client options — both `accessToken` and `previewToken` are passed up front, and `preview: previewMode` selects which one to use per request.

### Optional: live preview

Set `CPA_TOKEN`, then open `/landing?preview_session_id=<session-id>`. The route reads the session ID from the URL and passes it, together with `spaceId`, `environmentId`, and `CPA_TOKEN` as `previewToken`, to `useLivePreview`. The server-fetched plan is rendered first; later complete Experience updates replace it in the client renderer.

The Contentful app supplies `preview_session_id`. When it and `CPA_TOKEN` are both available, the route uses `fetchPreviewSession` for the initial plan and starts the browser subscription. `?preview=true` remains an explicit way to use the Preview API without a live session.

### Tokens summary

| Token       | API                | Used by                                      | Required?             |
| ----------- | ------------------ | -------------------------------------------- | --------------------- |
| `CMA_TOKEN` | Content Management | The bootstrap script (one-time seed)         | Yes, to run bootstrap |
| `CDA_TOKEN` | Content Delivery   | The example app                              | Yes, to run the app   |
| `CPA_TOKEN` | Content Preview    | The example app when the Preview API is used | Only for preview mode |

## File map

```
examples/sveltekit/
├── src/
│   ├── app.html              # SvelteKit HTML shell
│   ├── routes/
│   │   ├── +layout.svelte    # root layout
│   │   ├── +page.svelte      # index
│   │   ├── [slug]/+page.server.ts  # dynamic Experience load (server)
│   │   └── [slug]/+page.svelte     # dynamic Experience render
│   └── lib/
│       ├── components/       # design-system components; design arrives as props
│       │   ├── Button.svelte
│       │   ├── Card.svelte
│       │   ├── CardCta.svelte  # nested child; the getDesignValues() escape hatch
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

Identical to the Next.js example:

1. **Design-system components** stay portable, with no `@contentful/*` imports.
2. **`experience-config.ts`** is the wiring layer that maps Contentful component-type IDs to your design-system components.
3. **Routes** call `fetchExperience(experienceOptions, clientOptions, resolveOptions)` and pass the result to `<ServerExperienceRenderer>`, wrapped in a try/catch that routes `NotFoundError` to SvelteKit's `error(404, ...)`.

The only Svelte-specific difference is slots: each slot becomes a prop named after the slot holding a `Snippet[]` (render each with `{@render child()}`), where the React adapter hands you a `ReactNode[]` instead. `children` is just the conventional name for the default slot, not a special case. A slot's raw nodes are also still reachable via `getContentfulComponent().slots` and renderable through the exported `<NodesRenderer />`. See [`packages/adapter-svelte/README.md`](../../packages/adapter-svelte/README.md) for the full Svelte API surface.

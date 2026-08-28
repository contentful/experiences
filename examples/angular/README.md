# Angular example: Contentful Experiences

An Angular 20 + `@angular/ssr` app demonstrating `@contentful/experiences-angular` rendering an Experience payload fetched from XDA. Mirrors `examples/nextjs/` and `examples/sveltekit/` in registered components, slugs, and rendered output; the only thing that changes between the three apps is the framework-specific setup. (One component differs between the two reference examples themselves — see [the `Section` note](#a-note-on-section-where-the-two-reference-examples-disagree).)

## What it shows

- **Server-side fetch and resolve** via `fetchExperience` re-exported from `@contentful/experiences-angular`, which proves the fetch and resolver pipeline is genuinely framework-agnostic.
- **SSR rendering** with `<cf-server-experience>` (`ServerExperienceRendererComponent`).
- **Hydration-safe viewport seeding**: User-Agent parsed on the server in `src/server.ts`, passed as `initialViewportId`.
- **Styling from design inputs**: resolved design auto-fills each component's declared `@Input()`s by key, and every component here declares the design keys it consumes and styles from them. That is the recommended styling contract — and in Angular, declaring the input is also what makes the key arrive.
- **One escape-hatch demo**: `card.component.ts` styles itself from its inputs like the rest, but the nested `card-cta.component.ts` — not a registered component, so it has no inputs auto-filled — reads the card's design with `injectDesignValues()` inside a `computed()`. That's the case inputs can't cover.
- **Design tokens**: `app/lib/experience-config.ts` wires a `resolveToken` mapping token ids to CSS values.
- **Component registration**: bare Angular component classes for the common case, `defineComponent({ component, ... })` when a component needs `defaults` or `resolveData`. `card` uses the latter — an async enrichment fetch that prefixes its title with `Featured: `, plus a metadata-aware rewrite of relative CTA URLs into `/{locale}/{slug}{path}`.
- **Slot rendering**: `SectionComponent` and `PageComponent` take their slot as an input holding `PortableRenderNode[]` and render it with the exported `*cfNodes`.
- **Zoneless change detection** — `polyfills: []`, no `zone.js`, `provideZonelessChangeDetection()` on both the browser and server configs.

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
cd ../angular
cp .env.example .env                   # fill in SPACE_ID, ENVIRONMENT_ID, CDA_TOKEN
npm run dev
```

Visit `http://localhost:4200/landing`. `landing` is the Experience id the bootstrap printed; any other Experience id in your space works too.

`ENVIRONMENT_ID` must name the environment you actually bootstrapped into — the seeder writes wherever its own `.env` points, which is not necessarily `master`. A mismatch surfaces as `Execution plan not found for view: landing`, not as a 404 from the space.

`.env` has to exist before `npm run dev` — the scripts pass Node's `--env-file`, which errors on a missing file rather than skipping it.

To run the production build instead:

```sh
npm run build
npm run preview                        # http://localhost:4000/landing
```

### Query parameters

| Param           | Effect                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------ |
| `?preview=true` | Fetches from the Preview API using `CPA_TOKEN` (see below)                                 |
| `?debug=true`   | Turns on the resolver's debug output; reaches components as `injectExperience().debug`     |
| `?locale=de-DE` | Passed to `fetchExperience` **and** into `metadata`, where `card`'s `resolveData` reads it |

### Optional: preview mode

Add `CPA_TOKEN=...` (Content Preview API token from **Settings → API keys** in your space) to `.env`, then visit `http://localhost:4200/landing?preview=true`. The route reads from `preview.xdn.contentful.com`, which needs a preview token — a CDA token gets rejected there.

[`src/server.ts`](./src/server.ts) wires this through `fetchExperience`'s client options — both `accessToken` and `previewToken` are passed up front, and `preview: previewMode` selects which one to use per request. `?debug=true` turns on the resolver's debug output the same way.

### Tokens summary

| Token       | API                | Used by                              | Required?             |
| ----------- | ------------------ | ------------------------------------ | --------------------- |
| `CMA_TOKEN` | Content Management | The bootstrap script (one-time seed) | Yes, to run bootstrap |
| `CDA_TOKEN` | Content Delivery   | The example app                      | Yes, to run the app   |
| `CPA_TOKEN` | Content Preview    | The example app when `?preview=true` | Only for preview mode |

## File map

```
examples/angular/
├── src/
│   ├── index.html                    # HTML shell (<app-root>)
│   ├── styles.css
│   ├── main.ts                       # browser bootstrap
│   ├── main.server.ts                # SSR bootstrap (threads BootstrapContext)
│   ├── server.ts                     # Express 5 + AngularNodeAppEngine; fetches the plan
│   └── app/
│       ├── app.component.ts          # <router-outlet />
│       ├── app.routes.ts             # '' → Home, ':slug' → Experience
│       ├── app.routes.server.ts      # RenderMode.Server on '**'
│       ├── app.config.ts             # zoneless + router + client hydration
│       ├── app.config.server.ts      # + provideServerRendering(withRoutes(...))
│       ├── experience-store.ts       # REQUEST_CONTEXT → TransferState bridge
│       ├── pages/
│       │   ├── home.component.ts
│       │   └── experience-page.component.ts   # renders <cf-server-experience>
│       ├── components/               # plain design-system components; design arrives as inputs
│       │   ├── button.component.ts
│       │   ├── card.component.ts
│       │   ├── card-cta.component.ts # nested child; the injectDesignValues() escape hatch
│       │   ├── heading.component.ts
│       │   ├── hero-plain.component.ts
│       │   ├── image.component.ts
│       │   ├── page.component.ts     # registered as a coded Experience Template
│       │   ├── rich-text.component.ts
│       │   ├── section.component.ts  # renders its `children` slot via *cfNodes
│       │   └── text.component.ts
│       └── lib/
│           ├── design-tokens.ts            # token id → CSS value map, consumed by resolveToken
│           ├── detect-viewport.ts
│           ├── experience-config.ts        # integration layer (components + experience templates + resolveToken)
│           └── experience-route-data.ts    # the shape passed server → client
├── angular.json
├── tsconfig.json
├── tsconfig.app.json
└── package.json
```

## Integration pattern

Identical in shape to the Next.js and SvelteKit examples:

1. **Design-system components** own their own markup and styling. They declare the design keys they consume as `@Input()`s and style from them; only the nested `card-cta.component.ts` reads design through `injectDesignValues()`, because it isn't a registered component and so has nothing auto-filled onto it.
2. **`app/lib/experience-config.ts`** is the wiring layer that maps Contentful component-type IDs to your Angular component classes.
3. **The server** calls `fetchExperience(experienceOptions, clientOptions, resolveOptions)` and passes the result to `<cf-server-experience>`, catching `NotFoundError` to render a 404.

### Where Angular differs

**Data loading is done in Express, not in an Angular resolver.** A route resolver looks like the analogue of SvelteKit's `+page.server.ts`, but resolvers also run in the browser during client-side navigation — which would put the CDA/CPA tokens in the client bundle. So [`src/server.ts`](./src/server.ts) fetches the plan and hands it to the app as the `requestContext` argument of `AngularNodeAppEngine.handle()`; [`app/experience-store.ts`](./src/app/experience-store.ts) reads it back through `inject(REQUEST_CONTEXT)` and relays it to the browser via `TransferState` so hydration sees the same plan. `PortableRenderPlan` is plain JSON — the component classes live in `experienceConfig`, never in the plan — so it transfers cleanly.

**Slots are arrays plus a renderer.** Each slot arrives as an input named after the slot holding `PortableRenderNode[]`, and you render it with the exported `*cfNodes` — see `section.component.ts` (`children`) and `page.component.ts` (`content`). React hands you a `ReactNode[]` and Svelte a `Snippet[]`; Angular has no lazy renderable-children primitive that supports arbitrary named slots, so the nodes stay raw and `*cfNodes` is load-bearing rather than an escape hatch. Laziness is preserved either way: a slot you never bind never instantiates. Being a structural directive, it adds no element of its own: the children land as direct children of `section.component.ts`'s grid `<div>`, so `gap` and the grid tracks apply to them.

**Only declared inputs are set.** The adapter filters the merged props to the target component's declared inputs, because binding an input a component doesn't declare is an error. Keys a component doesn't declare are dropped rather than passed — they are still reachable through `injectDesignValues()`. `hero-plain.component.ts` declares `@Input() body` it never renders, purely so the filter passes it through.

**Dynamic elements are enumerated.** Svelte's `Heading.svelte` picks its tag with `<svelte:element this={tag}>`; Angular has no equivalent, so `heading.component.ts` clamps its `as` input to a known tuple and switches over the six heading tags.

**Two `angular.json` options are load-bearing, not boilerplate.**

- `"outputMode": "server"` is **required**. Without it `@angular/build` takes its legacy server code path, which never injects the app-engine manifest, and every request fails with `Angular app engine manifest is not set.` Setting it also makes `prerender` inapplicable — the builder warns that the option "is not considered" — so there is no `prerender` key here.
- `"security": { "allowedHosts": [...] }` gates `@angular/ssr`'s SSRF protection. A request whose `Host` header isn't allowlisted is **not** rejected — it silently deopts to client-side rendering, so the symptom is an empty SSR document rather than an error. **Deployments must add their own hostname.** Matching is on hostname only (the port is ignored) and `*.example.com` suffix wildcards are supported.

**`<cf-server-experience>` resolves the viewport once.** It seeds from `initialViewportId` and never consults `matchMedia`, which keeps SSR and hydration in agreement. If you want design values to follow live viewport changes on resize, swap it for `<cf-experience>` (`ClientExperienceRendererComponent`) in `pages/experience-page.component.ts`.

### A note on `Section`, where the two reference examples disagree

`section.component.ts` follows [`examples/sveltekit`](../sveltekit/src/lib/components/Section.svelte) and reads a **`columns`** design key, emitting `grid-template-columns: repeat(N, minmax(0, 1fr))`. [`examples/nextjs`](../nextjs/components/Section.tsx) instead reads a `ratio` key and falls back to `display: flex` when it's absent.

The seeded fixture only ever emits `columns` — declared at [`examples/scripts/fixture/components.ts:50`](../scripts/fixture/components.ts) and set to `'2'` at [`fixture/experience.ts:66`](../scripts/fixture/experience.ts) — and never emits `ratio` at all. So the Next.js `Section` always takes its flex fallback against this content model, while the SvelteKit and Angular ones render the intended two-column grid. Angular deliberately matches SvelteKit here; the Next.js component is stale relative to the fixture, which is worth fixing separately.

Measured against the same space and slug, this example's rendered output is textually identical to `examples/nextjs` and its inline styles are byte-identical to `examples/sveltekit`.

See [`packages/adapter-angular/README.md`](../../packages/adapter-angular/README.md) for the full Angular API surface and the React/Svelte/Angular parity table.

# SvelteKit example — Contentful Experiences

A SvelteKit 2 + Svelte 5 app demonstrating `@contentful/experiences-svelte` rendering an Experience payload fetched from XDA. Mirrors `examples/nextjs/` 1:1 in registered components, slugs, and visual output — the only thing that changes between the two apps is the framework chrome.

## What it shows

- **Server-side fetch + resolve** via `fetchExperience` re-exported from `@contentful/experiences-svelte` — proves the fetch + resolver pipeline is genuinely framework-agnostic.
- **SSR rendering** with `ServerExperienceRenderer` from `@contentful/experiences-svelte`.
- **Hydration-safe viewport seeding** — User-Agent parsed on the server in `+page.server.ts`, passed as `initialViewportId`.
- **`defineComponent` authoring** — same pattern as the React example, with `component: SvelteComponent` instead of `render: () => ReactNode`.

## Run it

```sh
# From the repo root:
npm install --ignore-scripts
npm run build                 # builds the SDK packages

cd examples/sveltekit
cp .env.example .env          # fill in SPACE_ID + CDA_TOKEN
npm run dev
```

Then visit `http://localhost:5173/<experience-id>` — the slug becomes the Experience ID passed to `client.view.getExperience`.

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
│       ├── components/       # plain design-system components — no SDK imports
│       │   ├── Button.svelte
│       │   ├── Header.svelte
│       │   ├── Page.svelte   # used as the page-level template
│       │   └── Text.svelte
│       ├── detect-viewport.ts
│       └── experience-config.ts    # integration layer (components + templates → experienceConfig)
├── svelte.config.js
├── vite.config.ts
└── tsconfig.json
```

## Integration pattern

Identical to the Next.js example:

1. **Design-system components** stay portable — no `@contentful/*` imports.
2. **`experience-config.ts`** is the wiring layer that maps Contentful component-type IDs to your design-system components.
3. **Routes** call `fetchExperience(experienceOptions, clientOptions, resolveOptions)` → `<ServerExperienceRenderer>`, wrapped in a try/catch that routes `NotFoundError` to SvelteKit's `error(404, ...)`.

The only Svelte-specific divergence: a customer component opts into slots via the `slot: Snippet<[string]>` dispatcher prop, calling `{@render slot('children')}` to render a named slot. Compare to the React adapter where each slot becomes its own named prop. See [`packages/adapter-svelte/README.md`](../../packages/adapter-svelte/README.md) for the full Svelte API surface.

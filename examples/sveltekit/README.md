# SvelteKit example: Contentful Experiences

A SvelteKit 2 + Svelte 5 app demonstrating `@contentful/experiences-svelte` rendering an Experience payload fetched from XDA. Mirrors `examples/nextjs/` 1:1 in registered components, slugs, and visual output; the only thing that changes between the two apps is the framework-specific setup.

## What it shows

- **Server-side fetch and resolve** via `fetchExperience` re-exported from `@contentful/experiences-svelte`, which proves the fetch and resolver pipeline is genuinely framework-agnostic.
- **SSR rendering** with `ServerExperienceRenderer` from `@contentful/experiences-svelte`.
- **Hydration-safe viewport seeding**: User-Agent parsed on the server in `+page.server.ts`, passed as `initialViewportId`.
- **Styling via `getDesignValues()` and `toCss()`**: components read their own design inside a `$derived` (reactive across viewport changes); design is never injected as props.
- **Design tokens**: `experience-config.ts` wires a `resolveToken` mapping token ids to CSS values.
- **Component registration**: bare Svelte components for the common case, `defineComponent({ component, ... })` when a component needs `defaults` or `resolveData`.

## Run it

```sh
# From the repo root:
npm install --ignore-scripts
npm run build                 # builds the SDK packages

cd examples/sveltekit
cp .env.example .env          # fill in SPACE_ID + CDA_TOKEN
npm run dev
```

Then visit `http://localhost:5173/<experience-id>`. The slug becomes the Experience ID passed to `client.view.getExperience`.

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
│       ├── components/       # plain design-system components; no SDK imports
│       │   ├── Button.svelte
│       │   ├── Header.svelte
│       │   ├── Page.svelte   # used as the page-level template
│       │   └── Text.svelte
│       ├── detect-viewport.ts
│       └── experience-config.ts    # integration layer (maps components + templates into experienceConfig)
├── svelte.config.js
├── vite.config.ts
└── tsconfig.json
```

## Integration pattern

Identical to the Next.js example:

1. **Design-system components** stay portable, with no `@contentful/*` imports.
2. **`experience-config.ts`** is the wiring layer that maps Contentful component-type IDs to your design-system components.
3. **Routes** call `fetchExperience(experienceOptions, clientOptions, resolveOptions)` and pass the result to `<ServerExperienceRenderer>`, wrapped in a try/catch that routes `NotFoundError` to SvelteKit's `error(404, ...)`.

The only Svelte-specific difference is slots: the default `children` slot is passed as a `children` Snippet prop (render it with `{@render children()}`), and any additional named slots are reachable via `getContentfulComponent().slots` and rendered through the exported `<NodesRenderer />`. Compare to the React adapter, where each slot becomes its own named React-node prop. See [`packages/adapter-svelte/README.md`](../../packages/adapter-svelte/README.md) for the full Svelte API surface.

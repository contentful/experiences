# SvelteKit example: Contentful Experiences

A SvelteKit 2 + Svelte 5 app demonstrating `@contentful/experiences-svelte` rendering an Experience payload fetched from XDA. Mirrors `examples/nextjs/` 1:1 in registered components, slugs, and visual output; the only thing that changes between the two apps is the framework-specific setup.

## What it shows

- **Server-side fetch and resolve** via `fetchExperience` re-exported from `@contentful/experiences-svelte`, which proves the fetch and resolver pipeline is genuinely framework-agnostic.
- **SSR rendering** with `ServerExperienceRenderer` from `@contentful/experiences-svelte`.
- **Hydration-safe viewport seeding**: User-Agent parsed on the server in `+page.server.ts`, passed as `initialViewportId`.
- **Styling from design props**: resolved design auto-fills each component's `$props()` by key, which is the recommended styling contract.
- **Deliberate escape-hatch coverage**: `Header.svelte` reads design with `getDesignValues()` + `toCss()` inside a `$derived` (reactive across viewport changes), so this harness exercises that path against a real space. It accepts whatever CSS-shaped keys the space sends without enumerating them — the reason to reach for the hook rather than props here.
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
│       │   ├── Page.svelte   # registered as a coded Experience Template
│       │   └── Text.svelte
│       ├── detect-viewport.ts
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

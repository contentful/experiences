# SvelteKit example: Contentful Experiences

A SvelteKit 2 + Svelte 5 app demonstrating `@contentful/experiences-svelte` rendering an Experience payload fetched from XDA. Mirrors `examples/nextjs/` 1:1 in registered components, slugs, and visual output; the only thing that changes between the two apps is the framework-specific setup.

## What it shows

- **Server-side fetch and resolve** via `fetchExperience` re-exported from `@contentful/experiences-svelte`, which proves the fetch and resolver pipeline is genuinely framework-agnostic.
- **SSR rendering** with `ServerExperienceRenderer` from `@contentful/experiences-svelte`.
- **Hydration-safe viewport seeding**: User-Agent parsed on the server in `+page.server.ts`, passed as `initialViewportId`.
- **Styling from design props**: resolved design auto-fills each component's `$props()` by key, and every component here declares the design keys it consumes and styles from them. That is the recommended styling contract.
- **One escape-hatch demo**: `Card.svelte` styles itself from props like the rest, but its nested `CardCta.svelte` — not a registered component, so it has no props of its own — reads the card's design with `getDesignValues()` inside a `$derived` (reactive across viewport changes). That's the case props can't cover.
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

### Optional: preview mode

Add `CPA_TOKEN=...` (Content Preview API token from **Settings → API keys** in your space) to `.env`, then visit `http://localhost:5173/landing?preview=true`. The route reads from `preview.xdn.contentful.com`, which needs a preview token — a CDA token gets rejected there.

The route ([`src/routes/[slug]/+page.server.ts`](./src/routes/[slug]/+page.server.ts)) wires this through `fetchExperience`'s client options — both `accessToken` and `previewToken` are passed up front, and `preview: previewMode` selects which one to use per request.

### Tokens summary

| Token       | API                | Used by                              | Required?             |
| ----------- | ------------------ | ------------------------------------ | --------------------- |
| `CMA_TOKEN` | Content Management | The bootstrap script (one-time seed) | Yes, to run bootstrap |
| `CDA_TOKEN` | Content Delivery   | The example app                      | Yes, to run the app   |
| `CPA_TOKEN` | Content Preview    | The example app when `?preview=true` | Only for preview mode |

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

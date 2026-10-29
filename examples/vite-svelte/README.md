# Vite + Svelte example: Contentful Experiences

A client-only Vite + Svelte 5 single-page app demonstrating `@contentful/experiences-svelte`. There is no SvelteKit and no server: the browser fetches the Experience from the Experience Delivery API, resolves it, and renders it. It mirrors [`examples/sveltekit`](../sveltekit) in registered components, slugs, and rendered output, so the two show the same Experience rendered on the server and in the browser.

## What it shows

- **Client-side fetch and resolve** in [`src/ExperiencePage.svelte`](./src/ExperiencePage.svelte): the same `fetchExperience` call the SvelteKit example makes in its server load function, awaited in the component with `{#await}`.
- **Client rendering** with `ClientExperienceRenderer`, with explicit loading, not-found, and error states.
- **Debug mode via `?debug=true`**: verbose SDK logging, visible `MissingComponent` boxes, and `<DebugExperience>`.
- **Styling from design props**: resolved design auto-fills each component's `$props()` by key, as in the SvelteKit example.
- **The `getDesignValues()` escape hatch**: [`CardCta.svelte`](./src/lib/components/CardCta.svelte) reads the card's design off context.
- **Design tokens**: [`src/lib/experience-config.ts`](./src/lib/experience-config.ts) wires a `resolveToken` mapping token ids to CSS values.
- **No router dependency**: [`src/App.svelte`](./src/App.svelte) reads the Experience id from the path. Replace it with your router; nothing SDK-related changes.

## Client-only trade-offs

| A server-rendered app gets                      | This app instead                                                                                                |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Tokens stay on the server                       | `VITE_CDA_TOKEN` is inlined into the bundle. Use a read-only delivery token.                                    |
| HTML arrives with content                       | Nothing renders until the fetch and resolve finish. Crawlers that do not run JavaScript see an empty page.      |
| Preview mode (`?preview=true`) and live preview | Not included. Both need a Content Preview API token, which must not ship to the browser. Use a server for them. |

## Run it

The example is a real integration against Contentful, not a mock. You need a Contentful space with the demo Experience seeded and a Content Delivery API token. See [`examples/scripts/README.md`](../scripts/README.md) for the seeding step.

```sh
# From the repo root:
npm install
npm run build                          # build the SDK packages

cd examples/vite-svelte
cp .env.example .env.local             # fill in VITE_SPACE_ID, VITE_CDA_TOKEN
npm run dev
```

Open [http://localhost:5174/landing](http://localhost:5174/landing).

| Script              | What it does                                       |
| ------------------- | -------------------------------------------------- |
| `npm run dev`       | Vite dev server on port 5174                       |
| `npm run build`     | Production build to `dist/`                        |
| `npm run preview`   | Serves `dist/` locally, with the same SPA fallback |
| `npm run typecheck` | `svelte-check`                                     |

To deploy, serve `dist/` from any static host and configure it to fall back to `index.html` for unknown paths so deep links like `/landing` resolve.

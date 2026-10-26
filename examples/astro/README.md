# Astro example: Contentful Experiences with a custom renderer

An Astro 7 server-rendered app that renders an Experience with `@contentful/experiences-react/custom-renderer` and native Astro islands. Interactive components hydrate on their own; everything else is static HTML and ships no JavaScript.

This is a reference for building a custom renderer on the React adapter, not an official Astro adapter. It renders the same demo Experience as [`examples/nextjs`](../nextjs) with the same components.

## Why Astro needs a custom renderer

Astro hydrates a component only when it appears in an `.astro` file with a `client:*` directive. `ServerExperienceRenderer` renders the whole Experience as one React tree, so Astro sees a single component and every component inside it stays static HTML. Putting a directive on the renderer does not work either: island props are serialized into the page, and the SDK `Config` holds component functions.

This app walks the plan in `.astro` markup instead, so each interactive node becomes its own island:

| Astro needs                                       | Provided by                                                                                                |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| The component and final props for each node       | `resolveNodeProps(node, config)`                                                                           |
| Island props that survive serialization           | `resolved.snapshot`                                                                                        |
| The component in the browser without passing it   | `createExperienceNode({ card: Card })` in [`ClientExperienceNode.tsx`](./src/exo/ClientExperienceNode.tsx) |
| SDK context (`useExperience`, ...) in each island | `ExperienceNode`, which mounts the same providers as the SDK renderers                                     |

## What it shows

- **Server-side fetch** with `fetchExperience` in [`src/pages/[slug].astro`](./src/pages/[slug].astro). `?preview=true` fetches draft content from the Content Preview API.
- **The walker** in [`src/exo/ExperienceNodes.astro`](./src/exo/ExperienceNodes.astro): static nodes render with `ExperienceNode`; ids in `clientComponents` render as `<ClientExperienceNode client:visible>`. Slots recurse with `Astro.self`.
- **An interactive component**: `Card` keeps local state (save, read more), so it only works as an island.
- **A host-inserted component**: the walker renders a `ChatWidget` island right after the hero. The host owns the walk, so it can place its own components between authored nodes.
- **Plain components**: nothing in `src/components` imports the SDK.

## Run it

You need a Contentful space with the demo Experience seeded. See [`examples/scripts/README.md`](../scripts/README.md).

```sh
# From the repo root (Node 22.22 or later, which Astro 7 requires):
npm install
npm run build                          # build the SDK packages

cd examples/scripts
cp .env.example .env                   # fill in SPACE_ID, ENVIRONMENT_ID, CMA_TOKEN
npm run bootstrap                      # one-time; prints the experienceId (default: `landing`)

cd ../astro
cp .env.example .env                   # fill in SPACE_ID, ENVIRONMENT_ID, CDA_TOKEN (CPA_TOKEN for ?preview=true)
npm run dev
```

Visit `http://localhost:4321/landing`, or `/landing?preview=true` for draft content.

## Limits

- **Island props must be serializable.** `resolveData` output reaches an island through `snapshot.props`, so return plain data from it.
- **Keep `<Fragment slot>` inline under the component tag.** Astro only reads `slot` on direct children; a fragment built in a variable lands in the default slot.
- **Send the `children` slot through Astro's default slot.** As a named slot it is overwritten with `undefined` when an island hydrates.
- **Slot content reaches an island as one HTML element**, not the `ReactNode[]` the SDK renderers pass. A component that maps over slot children individually behaves differently inside an island.
- **Each `client:*` directive needs its own branch**, because Astro reads directives statically. This app uses `client:visible` for every island.
- **Context does not flow between islands.** Each island gets its own SDK context from `ExperienceNode`; state shared across islands needs a store outside React context.
- **Unregistered ids are skipped.** `resolveNodeProps` returns `status: 'unregistered'`; this app renders nothing for them.

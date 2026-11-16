# Vite + React example: Contentful Experiences

A client-only Vite + React 19 single-page app demonstrating `@contentful/experiences-react`. There is no server: the browser fetches the Experience from the Experience Delivery API, resolves it, and renders it. It mirrors [`examples/nextjs`](../nextjs) in registered components, slugs, and rendered output, so the two show the same Experience rendered on the server and in the browser.

## What it shows

- **Client-side fetch and resolve** in [`src/ExperiencePage.tsx`](./src/ExperiencePage.tsx): the same `fetchExperience` call the Next.js example makes on the server, run in an effect. The `card` component's async `resolveData` runs in the browser too.
- **Client rendering** with `ClientExperienceRenderer`, with explicit loading, not-found, and error states.
- **Debug mode via `?debug=true`**: verbose SDK logging, visible `MissingComponent` boxes, and `<DebugExperience>`.
- **Design values as props**: every component declares the design keys it consumes as named props, as in the Next.js example.
- **CSS-in-JS**: [`src/components/Card.tsx`](./src/components/Card.tsx) is styled with styled-components. Resolved design values arrive as props and pass into the styled components as transient (`$`-prefixed) props, so they never reach the DOM. The other components use inline styles.
- **The `useDesignValues()` escape hatch**: the card's nested `CardCta` reads the card's design off context.
- **Design tokens**: [`src/lib/experience-config.ts`](./src/lib/experience-config.ts) wires a `resolveToken` that maps token ids to values from [`src/lib/design-tokens.ts`](./src/lib/design-tokens.ts).
- **Destination routing**: the URL path is the Destination path, so `/` and `/demo/landing` resolve to different Experiences. A redirect node (`/welcome`) comes back as `{ redirect }` and the app follows it with `location.replace`. `/experiences/<id>` fetches one Experience by id instead.
- **No router dependency**: [`src/App.tsx`](./src/App.tsx) chooses between those two from `location.pathname`. Replace it with your router; nothing SDK-related changes.

## Client-only trade-offs

| A server-rendered app gets | This app instead                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Tokens stay on the server  | `VITE_CDA_TOKEN` is inlined into the bundle. Use a read-only delivery token.                                    |
| HTML arrives with content  | Nothing renders until the fetch and resolve finish. Crawlers that do not run JavaScript see an empty page.      |
| Preview Sessions           | Not included. A browser integration needs a Preview API token approved for browser exposure or a trusted proxy. |

## Run it

The example is a real integration against Contentful, not a mock. You need a Contentful space with the demo Experience seeded and a Content Delivery API token. See [`examples/scripts/README.md`](../scripts/README.md) for the seeding step.

```sh
# From the repo root:
npm install
npm run build                          # build the SDK packages

cd examples/vite-react
cp .env.example .env.local             # fill in VITE_SPACE_ID, VITE_DESTINATION_ID, VITE_CDA_TOKEN
npm run dev
```

`VITE_DESTINATION_ID` is server-generated. The bootstrap prints it at the end; paste it into `.env.local`.

Open [http://localhost:5173/](http://localhost:5173/) (the Destination's home node) and [http://localhost:5173/demo/landing](http://localhost:5173/demo/landing). `/welcome` is a redirect node back to `/`. For one Experience by id, open `/experiences/landing`; that route uses `VITE_ENVIRONMENT_ID`, while Destination delivery is space-scoped.

| Script              | What it does                                       |
| ------------------- | -------------------------------------------------- |
| `npm run dev`       | Vite dev server on port 5173                       |
| `npm run build`     | Production build to `dist/`                        |
| `npm run preview`   | Serves `dist/` locally, with the same SPA fallback |
| `npm run typecheck` | `tsc --noEmit`                                     |

To deploy, serve `dist/` from any static host and configure it to fall back to `index.html` for unknown paths so deep links like `/demo/landing` resolve.

# Vite + Svelte example: Contentful Experiences

A client-only Vite + Svelte 5 single-page app demonstrating `@contentful/experiences-svelte`. There is no SvelteKit and no server: the browser fetches the Experience from the Experience Delivery API, resolves it, and renders it. It mirrors [`examples/sveltekit`](../sveltekit) in registered components, slugs, and rendered output, so the two show the same Experience rendered on the server and in the browser.

## What it shows

- **Managed client-side fetch and resolve**: [`src/lib/experiences.ts`](./src/lib/experiences.ts) binds the registry once with `createExperiences`. One stable `ExperiencesRoot` owns the browser SDK; [`src/ExperiencePage.svelte`](./src/ExperiencePage.svelte) selects its primary content with the bound `Experience`.
- **Client rendering** with explicit loading, not-found, and safe error states. Successful empty content stays successful; applicable content takes priority over a temporary acquisition-error fallback.
- **Debug mode via `?debug=true`**: verbose SDK logging, visible `MissingComponent` boxes, and `<DebugExperience>`.
- **Styling from design props**: resolved design auto-fills each component's `$props()` by key, as in the SvelteKit example.
- **The `getDesignValues()` escape hatch**: [`CardCta.svelte`](./src/lib/components/CardCta.svelte) reads the card's design off context.
- **Design tokens**: [`src/lib/experience-config.ts`](./src/lib/experience-config.ts) wires a `resolveToken` mapping token ids to CSS values.
- **Actual-root tracking attributes**: registered components spread unconsumed HTML props onto their existing outer elements, retaining caller attributes, events, styles and Svelte attachments. Web measures permitted views, hovers and clicks through its existing detectors and consent policy; the design-system components add no SDK tracking calls.
- **Destination routing**: the URL pathname is the Destination path, so `/` and `/demo/landing` resolve to different Experiences. A redirect node (`/welcome`) comes back as `{ redirect }`; the bound `onRedirect` validates a local root-relative path and replaces the current history entry through host navigation. Invalid targets use the managed error fallback. `/experiences/<id>` fetches one Experience by id instead; both selectors support `?locale=…`.
- **No router dependency**: [`src/lib/navigation.svelte.ts`](./src/lib/navigation.svelte.ts) commits URL snapshots after successful host history changes, and [`src/App.svelte`](./src/App.svelte) supplies the route key and page payload. Ordinary internal links and back/forward update the same root. Modified clicks, downloads, external links, new-tab targets and fragment scrolling retain browser behavior.

## Client-only trade-offs

| A server-rendered app gets | This app instead                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Tokens stay on the server  | `VITE_CDA_TOKEN` is inlined into the bundle. Use a delivery token explicitly approved for browser exposure, or a trusted authenticated proxy. |
| HTML arrives with content  | Nothing renders until the fetch and resolve finish. Crawlers that do not run JavaScript see an empty page.                                    |
| Preview Sessions           | Not included. A browser integration needs a Preview API token approved for browser exposure or a trusted proxy.                               |

## Run it

The example is a real integration against Contentful, not a mock. You need a Contentful space with the demo Experience seeded and a Content Delivery API token. See [`examples/scripts/README.md`](../scripts/README.md) for the seeding step.

Keep `VITE_CDA_TOKEN` separate from private server credentials. Alternatively, set
`VITE_DELIVERY_HOST` to a trusted proxy and leave `VITE_CDA_TOKEN` empty; the proxy
owns upstream authentication and must allow the SDK request headers and the app's
origin. This is the existing Runtime `delivery.host` configuration, not a new SDK
authentication mode. All `VITE_*` values are public build-time configuration.

```sh
# From the repo root:
npm install
npm run build                          # build the SDK packages

cd examples/vite-svelte
cp .env.example .env.local             # fill in VITE_SPACE_ID, VITE_DESTINATION_ID, VITE_CDA_TOKEN
npm run dev
```

`VITE_DESTINATION_ID` is server-generated. The bootstrap prints it at the end; paste it into `.env.local`.

Open [http://localhost:5174/](http://localhost:5174/) (the Destination's home node) and [http://localhost:5174/demo/landing](http://localhost:5174/demo/landing). `/welcome` is a redirect node back to `/`. For one Experience by id, open `/experiences/landing`; that route uses `VITE_ENVIRONMENT_ID`, while Destination delivery is space-scoped.

| Script              | What it does                                       |
| ------------------- | -------------------------------------------------- |
| `npm run dev`       | Vite dev server on port 5174                       |
| `npm run build`     | Production build to `dist/`                        |
| `npm run preview`   | Serves `dist/` locally, with the same SPA fallback |
| `npm run typecheck` | `svelte-check`                                     |

To deploy, serve `dist/` from any static host and configure it to fall back to `index.html` for unknown paths so deep links like `/demo/landing` resolve.

## Committed navigation and page ownership

The host uses `pathname + search` verbatim as `routeKey`, and pathname alone for
Destination lookup. Initial deep links, internal links and `popstate` back/forward
select through the same stable root. There is no manual fetch or page send,
second SDK, SDK history patch, or mandatory router. Web owns event construction,
consent, current-page admission and transport. The root's page payload carries
the committed locale, path, original search and hash; payload-only changes do not start another page
attempt. To deliberately disable automatic page intent, pass
`personalization={{ events: [] }}` to `Experience`. Retry/refresh through the
managed accessor remain event-free.

Normal `#fragment` links scroll natively and update metadata without changing
page identity or fetching content. Cross-page fragments and initial deep-link
fragments scroll after `onExperienceResolved` and Svelte `tick` commit the rendered
content, provided the target is still current. Ordinary host navigation scrolls to
the top after content commits; back/forward retains browser scroll restoration.
Removing a fragment on the same route scrolls after `tick` without waiting for
another content-resolution notification or requesting content again.
A hash router instead chooses identity for
its logical route and supplies the logical Destination path separately. If you
later enable Preview for such a router, its committed key must include the full
`pathname + search + hash`, for example
`/shell?preview_session_id=one#/products`, so session entry, change and exit reach
the existing activation boundary. Report that URL through host state; no SDK URL
observer, Preview-specific component key or second root is needed. This example
keeps Preview unconfigured; see the [adapter guide](../../packages/adapter-svelte/README.md#managed-browser-integration)
for the optional capability and browser credential requirements.

## Interaction attribution

Ordinary managed by-ID selection already opts into the existing
`extensions: { sourceMap: {} }` request through the SDK. The renderer places plan
attribution on its container and supplies root scope attributes as ordinary
component props; the samples forward those props onto their real outer elements,
excluding their content, design and slot inputs. Caller style follows the sample's
computed styles, and explicit root-attribute overrides remain intact.

Views, hovers and clicks are measured only when valid source attribution and the
runtime's consent/profile policy permit them. Delivery currently omits source maps
and node IDs for Destination responses, so those routes do not demonstrate complete
measured tracking. They accept no source-map extension; the example invents no
attribution. Use `/experiences/landing` for the by-ID integration after seeding,
subject to the deployed response supplying attribution. Local build/type checks
do not establish live measurements or event delivery. Live Destination
walkthroughs and attribution remain deferred. See the
[service verification status](../../packages/adapter-svelte/README.md#service-verification).

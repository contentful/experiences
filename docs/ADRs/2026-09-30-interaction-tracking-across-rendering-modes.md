# Interaction tracking across SSR, CSR, and hybrid rendering

- **Date:** 2026-09-30
- **Status:** Proposed
- **Ticket:** [NT-3535](https://contentful.atlassian.net/browse/NT-3535), under
  [NT-3536](https://contentful.atlassian.net/browse/NT-3536) P13n & A7s support in the
  Experiences SDK

## Context

NT-3535 adds automatic view, hover, and click tracking for rendered Experience and
Fragment nodes, and asks us to "evaluate impact of the implementation on
SSR/CSR/Hybrid implementations". This record is that evaluation.

The tracking side is built in `packages/web`, ported from the Optimization Web SDK's
entry tracking:

- `createInteractionTracking` (`packages/web/src/interaction-tracking.ts`) finds
  elements carrying `data-ctfl-node-id`, with an initial scan plus a
  `MutationObserver`, and hands them to the view, hover, and click detectors.
- The attribute holds only a node id. Detectors turn it into attribution by calling
  a caller-supplied `resolveAttribution(nodeId)` when an event fires.
- It is internal and is not exported from the package entry.

The attribute and the lookup are the two things every rendering mode has to supply.
NT-4312 owns the other half: resolving attribution from the XDA source map and
exposing it to rendered components. Its criteria rule out tracking DOM wrappers and
SDK fields in customer-owned props. So the element that carries the attribute
belongs to the customer's component, which reads the attribute from an accessor.

The facts below were checked in the code rather than assumed.

- **Node ids are optional and never generated.**
  - `resolveExperience` copies `node.id` when it is a non-empty string
    (`packages/core/src/resolve-experience.ts:259,293`). `id` is optional in the
    payload type (`packages/core/src/types.ts:159,169`).
  - Nothing checks that ids are unique. Angular falls back to position when an id
    is "absent or duplicated in one plan"
    (`packages/adapter-angular/src/node-render-engine.ts:414-416`). React and Svelte
    key on `nodeId ?? index`.
  - Fragments arrive inlined in the node tree, not as separate payloads
    (`examples/scripts/fixture/experience.ts:72-74`).
- **Every example renders one plan per page.** This holds for Next.js, SvelteKit,
  and Angular. `fetchByDestinationNode` and `fetchByDestinationPath` exist on the
  runtime (`packages/client/src/contentful-experiences.ts:77-84`), but nothing uses
  them.
- **What reaches the browser differs by renderer:**

  | Renderer                         | Plan in the browser?                                                                                                                                                                                                                                                                   |
  | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | React `ClientExperienceRenderer` | Yes: it is a prop, so under Server Components the whole plan is serialized (`packages/adapter-react/src/client-renderer.tsx:41`).                                                                                                                                                      |
  | React `ServerExperienceRenderer` | No. But its per-node `ContentfulComponentProvider` is a client component (`packages/adapter-react/src/context.tsx:9`), so each node's `nodeId`, `content`, and `resolved` data already cross the Server Components boundary (`packages/adapter-react/src/nodes-renderer.tsx:243-250`). |
  | SvelteKit                        | Yes: `load` returns the plan as page data (`examples/sveltekit/src/routes/[slug]/+page.server.ts:65-72`).                                                                                                                                                                              |
  | Angular SSR                      | Yes: through `TransferState` (`examples/angular/src/app/experience-store.ts:23-27`).                                                                                                                                                                                                   |

- **The event handoff carries events only.**
  - Its schema holds space and environment ids, an optional profile id, event
    bodies, and a route key, all under a 64 KiB cap
    (`packages/client/src/runtime-event-handoff.ts:12-32`).
  - The README says to deliver it only in private, no-store responses.
  - No adapter or example wires it yet (`README.md:251-262`).
- **Live Preview replaces the whole plan on every update.**
  - Each WebSocket message carries a full payload, which is resolved into a new plan
    (`packages/adapter-react/src/use-experience-plan.ts:32-53`).
  - Elements are reused only when node ids stay stable. We found no guarantee that
    the editor keeps them stable.
- **The web runtime has no destroy or dispose method.** `reset()` clears the
  profile (`packages/web/src/contentful-experiences.ts:129-135`). Tracking has its
  own lifecycle: `refresh`, `endActive`, and `destroy`.

## Decision

**Tracking is a browser-only layer keyed by `data-ctfl-node-id`, which holds the
node's `nodeId`. The rendered markup carries only that opaque key. Whatever owns
the rendered plan in the browser supplies the id → attribution lookup.**

1. **The attribute is the same on the server and in the browser.**
   - It is derived from `nodeId`, which both renders already have, so it cannot
     cause a hydration mismatch.
   - It goes only on the outermost element of each Experience or Fragment
     instance, through the NT-4312 accessor.
   - A node without an id cannot be tracked. Generating ids is out of scope: the
     SDK deliberately never generates them, and a generated id would have to be
     identical on the server and in the browser.

2. **Where the lookup comes from depends on the render mode.**
   - **Client render, SvelteKit, Angular SSR, and the React
     `ClientExperienceRenderer`:** the plan is already in the browser, so the
     lookup is built from it. Nothing extra needs to be sent.
   - **React `ServerExperienceRenderer`:** the plan stays on the server. The server
     sends a small serializable map from id to attribution, with one entry per
     Experience or Fragment instance, as a prop of the client component that owns
     tracking. The map depends only on the lookup contract, not on how NT-4312
     shapes its accessors.
   - **Not the event handoff.** Its schema is events-only, and its 64 KiB cap is
     shared with event bodies. It is also meant for private, uncached responses,
     while tracking needs to work on cacheable pages too.

3. **Server-only and stateless code is unaffected.**
   - Views, hovers, and clicks need a browser. `createInteractionTracking` does
     nothing where `document` or `MutationObserver` is missing, and the Node
     runtime never loads it.
   - Rendering is unchanged when tracking is off or the source map was not
     requested.

4. **Tracking starts after hydration and only observes.**
   - Whatever owns tracking creates it in a client lifecycle hook, such as a React
     effect, `onMount`, or `afterNextRender`. It adds no DOM, so it cannot change
     hydrated markup.
   - Elements added later are picked up by the `MutationObserver`. That covers
     client navigation, lazy content, and streamed server-component chunks.

5. **A new plan means a new lookup.**
   - On a Live Preview update or client navigation, the owner swaps the lookup and
     calls `refresh()`.
   - If an update changes a node's id, the re-rendered attribute is picked up as an
     attribute change. A test covers this
     (`packages/web/src/interaction-tracking.test.ts`).
   - Before tearing tracking down, the owner calls `endActive()` so that views and
     hovers in progress send their final events.

6. **There is one tracking instance per page.** The lookup merges every plan
   rendered on the page. Ids are only unique within a plan, so two plans that share
   a node id would share attribution. Today no path renders more than one plan per
   page, so this risk is accepted and documented rather than designed around now.
   See the open questions.

## Consequences

- **Rendering cost:** client renders and the other modes that already ship the
  plan pay nothing extra for tracking. React Server Components pay for one small
  map per page.
- **Hydration:** it is unaffected, and tracking needs no changes to how any adapter
  renders.
- **`display: contents`:** an element with `display: contents` has no box of its
  own. The view observer handles it by measuring its single rendered child, or its
  content rects when there is more than one child.
- **Unload delivery:** the final view and hover events fired on `pagehide` go
  through the normal `trackView` and `trackHover` calls. Getting them delivered
  reliably is left to the event queue and beacon work in
  [NT-4154](https://contentful.atlassian.net/browse/NT-4154).
- **Consent:** nothing is gated on consent yet. That is
  [NT-4151](https://contentful.atlassian.net/browse/NT-4151), which follows this
  work.

## Open questions

- **Several plans on one page.** When destination fetches, or several Experiences
  on one page, become a supported path, do ids need scoping? The options are an
  attribute value such as `planKey:nodeId`, or one tracking instance per plan with
  a `root` container.
- **Nodes without ids.** Is an id-less node common enough in real XDA payloads to
  matter? Only authored fixtures were available here.
- **React Server Components alternative.** The per-node client provider already
  carries `nodeId` across the boundary. If NT-4312 also puts attribution there, the
  provider could register it with the tracking owner on mount. That would replace
  the page-level map, at the cost of tying tracking to the accessor's shape.
- **Impressions.** The consumer DX proposal lists impression events separately from
  views. Whether they are in scope for NT-3535 is undecided.

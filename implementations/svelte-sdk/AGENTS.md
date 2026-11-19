# SvelteKit 3 reference

Read `README.md`, parent `implementations/AGENTS.md`, and the root instructions.
This private standalone application consumes all eight public Svelte/Node/Web SDK
closure tarballs. Keep Kit 3, TypeScript 6 and Vite 8 application dependencies local.
Do not add this directory to root npm workspaces or import package SDK source.

- Use public `/kit/client`, `/kit/server` and portable Svelte exports. One stable
  `request.ExperiencesRoot` reads the committed `page.data.primarySource` and its
  loader metadata route key; shallow intent URL edits do not start a visit. CSR has
  a metadata-only loader with `ssr=false` and no source. Do not add client `init`.
- One lazy server binding chooses its document mode from the trusted outer route.
  The public endpoint never gains document commitment or cookie authority from
  browser fields.
- Explicit actions use the managed view's `acquire` with fresh nonpage intent on
  the committed selector. Repeated presentations reuse the selected plan.
  Retry follows the selected source and adds no events. Remove attributed DOM
  synchronously before visitor Reset, then conceal retained data until a fresh
  successful replacement. Do not remount the selecting controller just for Reset.
- Diagnostic later IDs are event-free and identity-free; official support is one
  Experience per page. Use the SDK's `serializePlan` for server comparisons and
  omit ordinary comparison fetches in active Preview.
- Keep actual node roots and named `Snippet[]` slots. Manual views use the existing
  Web container marker plus root suppression, not a DOM scanner/map or observer.
  SDK observables report attempts; never call them delivery/commit receipts.
- Private `.env` is read lazily on the server. Browser assets receive only the
  explicit allowlist in `public-config.ts`. Server credentials never become browser
  defaults. The optional Preview factory requires a deployment gate and a separate
  browser token; `LIVE_PREVIEW_SESSION_ID` is an unread convenience field.
- Keep responses private/no-store and the Delivery proxy limited to fixed upstream,
  configured space/environment/IDs, allowed methods and bounded same-origin POSTs.
- Kit 3 supports native per-node SSR recovery via synchronous `handleError`.
  Return a sanitized JSON-safe object; original exceptions stay in server logs.
- Preserve existing `.env` bytes. Stop only this app before installation/cleanup.
  Parent owns SDK packing during coordinated work; use the shared installer
  directly against frozen archives until repacking is explicitly coordinated.
- Validate with local typecheck/lint/build and the existing app's native lifecycle.
  Do not add mock services, E2E infrastructure, generators or extra test apps.
  Live service/event calls require coordination. Live Preview verification is
  explicitly deferred, as are live Destination walkthroughs and attribution.
  Continue local checks of session/selector behavior and the native application lifecycle.

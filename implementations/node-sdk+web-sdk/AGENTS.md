# Node + Web SDK reference implementation

- Read the parent implementation instructions, this app's README, and the entire
  checkout-local `tmp/node-sdk-web-sdk-reference-implementation-plan.md` before
  editing. The plan defines scope and acceptance gates. Phases 1–4 are accepted;
  Phase 5 client rendering/actions are implemented; stop for acceptance before Phase 6.
- Keep this application outside root workspaces. Consume installed local tarballs
  of the public Node/Web SDKs with Client, Runtime and Core overrides. Use the
  maintained installer and pack both dependency chains. No workspace source aliases,
  internal Runtime imports, SDK changes, or adjacent Optimization runtime dependency.
- Use app-local npm tools through `implementation-node-sdk-web-sdk` Nx targets.
  Refresh setup/install after SDK artifact changes; asset build copies only the
  installed Web UMD/map and bundles Rich Text/pure tracking helpers separately.
  Build shared.ts once to private dist; copy the same JS bytes for browser use.
  Shared SDK references are type-only; SDK execution stays in runtime adapters.
  `public/dist` is generated; the local Web theme retains its pinned provenance.
- Runtime reads only this app's ignored `.env` via dotenv. Preserve it during
  installation and cleanup. Keep `.env.example` credential-free. The sole public
  configuration allowlist is `SPACE_ID`, `ENVIRONMENT_ID`, `CDA_TOKEN`, `LOCALE`,
  resolved `EXPERIENCE_IDS`. `PORT` and unrelated settings stay private. CDA_TOKEN
  must be appropriate for public browser use; never copy management/preview tokens.
- Serve only public assets, explicit Home/Page Two routes, and API-free health.
  Bind to loopback. Missing routes/assets return 404; never serve the app directory.
- Server integration is actual EJS SSR. Browser activation adopts state without
  startup refetch/page or DOM replacement, then enables SDK-owned tracking. It uses
  the committed server page and embedded identify flow, not prepared replay.
  Follow the plan for request-bound event construction, separate consent cookies,
  permitted identity, HTML-safe bootstrap, private/no-store caching and diagnostics.
  The sibling Node cookie prohibition and Web static-host rule are sibling-local.
- Phase 3 uses one Node SDK with a facade per request: await direct page admission
  and SDK-owned profile, build identify with `request.eventBuilder`, fetch distinct
  IDs sequentially once with source maps, and package the final profile through
  the public Node producer. Keep diagnostic strings out of automatic UI/logs/bootstrap.
- Construct Web with all automatic interaction flags false and profile/consent
  defaults omitted. Subscribe, await state-only hydration, then enable views on
  app-main plus hovers/clicks and register manual roots from their real data.
  Preserve SSR on failure. Never add positive SSR opt-ins before hydration.
- Browser consent comes from SDK observables; mirror effective snapshots one way
  to independent app cookies. Grant/Revoke changes both axes with SDK commands,
  without content fetch/page calls. Release subscriptions on final exit and preserve
  the owner for BFCache; let the SDK finish its own hide/unload measurements.
- Keep startup separate from client route rendering. Navigation/back/forward sends
  one page before distinct sequential fetches; Identify/Retry joins a pending page.
  Build one contextual identify per explicit content cycle and include it in each
  distinct XDA fetch, never independently or together with the already-committed page.
- Reset must synchronously invalidate app work, replace old attributed DOM, detach
  the pending page chain, then reset the SDK and start a fresh page/fetch cycle.
  Normal removal finalizes before manual overrides are cleared; register new roots
  only after insertion. Check ownership after awaits and before further fetch/UI work.
- Preserve EJS/DOM registration, named-slot, prop and real attribution parity. Keep
  client partial content with generic diagnostic counts; never dump the strings.
  Custom track is separate from XDA and its admission label does not promise delivery.
- index.ejs owns both SSR markup and native template elements. Reuse its markup
  functions; the client clones native templates and never compiles/renders EJS.
- Match the Web reference theme, main-pane Utilities and split content layout.
- The event-attempt sidebar and full Phase 6 guidance remain later-phase work.
  Do not scaffold the sidebar before acceptance.
- No tests, test infrastructure, mocks, fixtures, simulated upstreams, verification
  runners, test-only hooks, transport workarounds, Live Preview or Live Updates.
  Validate using the actual install/build/lint/typecheck commands, installed exports
  and declarations, and direct shell/asset/health inspection.
- Typecheck covers server/build TypeScript; lint covers authored browser JavaScript
  when present. EJS and browser content property accesses are not typechecked.
- Stop/restart/status/logs must target only `experiences-node-web-sdk-app`.
  Preserve siblings, unrelated processes, local credentials and stack metadata.
  The user authorized committing/pushing the accepted Phase 2 foundation. Later
  phase commits/pushes and PR creation require separate authorization.

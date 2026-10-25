# Node + Web SDK reference implementation

- Read the parent implementation instructions, this app's README, and the entire
  checkout-local `tmp/node-sdk-web-sdk-reference-implementation-plan.md` before
  editing. The plan defines scope and acceptance gates. Phase 2 is accepted and
  Phase 3 server rendering is authorized; stop for acceptance before Phase 4.
- Keep this application outside root workspaces. Consume installed local tarballs
  of the public Node/Web SDKs with Client, Runtime and Core overrides. Use the
  maintained installer and pack both dependency chains. No workspace source aliases,
  internal Runtime imports, SDK changes, or adjacent Optimization runtime dependency.
- Use app-local npm tools through `implementation-node-sdk-web-sdk` Nx targets.
  Refresh setup/install after SDK artifact changes; asset build copies the installed
  Web distribution unchanged and bundles only Rich Text and pure tracking helpers.
  `public/dist` is generated; the local Web theme retains its pinned provenance.
- Runtime reads only this app's ignored `.env` via dotenv. Preserve it during
  installation and cleanup. Keep `.env.example` credential-free. The sole public
  configuration allowlist is `SPACE_ID`, `ENVIRONMENT_ID`, `CDA_TOKEN`, `LOCALE`,
  resolved `EXPERIENCE_IDS`. `PORT` and unrelated settings stay private. CDA_TOKEN
  must be appropriate for public browser use; never copy management/preview tokens.
- Serve only public assets, explicit Home/Page Two routes, and API-free health.
  Bind to loopback. Missing routes/assets return 404; never serve the app directory.
- The accepted later integration is actual EJS SSR, then state-only browser
  hydration without startup refetch/page, followed by SDK-owned tracking. It uses
  the committed server page and embedded identify flow, not prepared replay.
  Follow the plan for request-bound event construction, separate consent cookies,
  permitted identity, HTML-safe bootstrap, private/no-store caching and diagnostics.
  The sibling Node cookie prohibition and Web static-host rule are sibling-local.
- Do not construct SDKs, fetch/render Experiences, add visitor controls, hydrate,
  or register tracking as part of Phase 2. Do not scaffold later-phase modules.
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

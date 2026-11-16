# Node SDK reference implementation

Official support is one Experience fetch per page, without code enforcement.
Reference multi-ID loops exist only to compare rendering scenarios, not as
supported product usage or a cross-fetch guarantee.

- Use ordinary package scripts for commands; keep any necessary shared tooling in
  repository-level TypeScript scripts executed with `tsx`. Do not add app-owned
  runner, process-management, or verification scripts.
- Keep this app outside root npm workspaces and consume only packed public SDK
  exports. Keep its TypeScript, lint configuration, and tools local.
- Credentials belong in this app's ignored `.env`. Values may be gathered from
  `lib/mocks` during setup; runtime and launch commands must not read it.
- Use `npx nx run implementation-node-sdk:<target>` from the root. Run setup or
  install after SDK artifacts change; never add workspace source aliases to bypass
  a failed installation.
- Keep one runtime and a facade per request. Supply literal identify arguments with
  `traits: { identified: true }` and explicit page arguments in ordinary
  `fetchExperience({ personalization: { events } })`; the SDK builds admitted
  arguments once and also accepts raw built events. Later comparison IDs and same-ID
  Retry use ordinary event-free fetch, with no builders, hooks or replay.
  Reuse plans for repeated presentations. Profiles remain SDK-managed; add no
  manual input, cookies or sessions.
- XDA preflight leaves this SSR intent uncommitted. This is a tolerated service bug
  awaiting upstream force-commit support; add no SDK workaround or current force flag.
  This app has no aggregate commit path or actual server-to-browser
  transfer and uses no handoff producer. Direct event APIs remain callable without
  becoming prerequisites or compensation. See
  [Runtime's XDA contract](../../packages/runtime/README.md#xda-preflight-and-profile-finalization)
  and the README's [personalization contract](./README.md#personalization-contract-and-validation-limits).
- Use the public runtime for SDK operations. Do not inspect raw responses or
  compensate for runtime gaps with application-level transport adapters.
- Preserve Optimization's EJS shell and styling. Keep the shell in `index.ejs`
  and recursive node rendering in `nodes.ejs`; Rich Text uses Contentful's HTML renderer.
  Use ordinary EJS escaping for text/attributes and the Contentful renderer directly.
  Only cover this reference space’s content shapes. Do not add diagnostic UI,
  speculative fallbacks, custom Rich Text handling, or a general rendering framework.
  Any deviation from Optimization must be necessary for the actual integration.
- `src/contentful-generated.d.ts` is copied by the existing `lib/mocks` generation
  command. Do not hand-edit it or add manually maintained content interfaces.
- Preserve `.env` during cleanup/reinstallation. Stop only the named app process;
  never stop unrelated PM2 processes.
- Validate local changes with `typecheck`, `lint`, and direct execution. There is no E2E
  suite or mock-server integration.

- Optional preview uses request-local `livePreview`, the installed optional package,
  and ordinary `fetchExperience`. Skip visitor work under `request.isPreview` and
  call `request.destroy()` in `finally`. See the README for snapshot configuration.
  Activate only when app-local `LIVE_PREVIEW_ENABLED === 'true'` and the URL has a
  nonempty trimmed `preview_session_id`; pass explicit `isPreview: Boolean(livePreview)`.
  `LIVE_PREVIEW_SESSION_ID` is local convenience storage only; runtime/build code
  must never read it. Missing/empty sessions or a disabled flag use ordinary events.

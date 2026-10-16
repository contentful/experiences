# Node SDK reference implementation

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
- Follow Optimization's Node reference: one runtime, a facade per request, page,
  optional identify, then content fetches. Profile IDs come from API responses
  and stay SDK-managed; do not add manual profile input, cookies, or sessions.
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

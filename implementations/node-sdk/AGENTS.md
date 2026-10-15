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
- The current implementation is a network-free health scaffold. Do not add live
  fetches or rendering until the corresponding implementation phase is authorized.
- Preserve `.env` during cleanup/reinstallation. Stop only the named app process;
  never stop unrelated PM2 processes.
- Validate local changes with `typecheck`, `lint`, and direct execution. There is no E2E
  suite or mock-server integration.

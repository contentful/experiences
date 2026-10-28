# React SDK reference foundation

- Read this app's README, parent implementation guidance and the accepted React
  plan/design before changes. Extend the permanent app in place.
- Phase 3 owns the React/Vite shell, local configuration/assets, tarball manifest,
  Nx and scoped lifecycle. Rendering, SDK ownership/controls and managed
  content/events/preview belong to Phases 4, 5 and 6 respectively. Do not bridge
  unavailable capabilities with fake controls, loading or orchestration.
- Keep the app private and outside npm workspaces. Use the existing installer,
  installed local tarballs and internal-chain overrides; no workspace aliases,
  private package imports, Next dependency or temporary consumers.
- Use public React `/client` for browser integration and `/server` for static/server
  integration where applicable. The foundation imports no SDK code and constructs
  no runtime.
- Preserve `.env`; read only this app's file. Keep `.env.example` credential-free.
  Project browser configuration through the explicit allowlist, escape inline
  JSON and disable Vite environment exposure. Never print credentials or copy
  management/server-only preview settings into browser config.
- Keep default Experience IDs and optional overrides aligned with Web. Profiles
  remain SDK-owned once integrated; never add manual profile entry or an app store.
- Preserve Web theme provenance/license, Utilities/split layout and ordinary
  Home/Page Two links. Describe foundation availability truthfully without
  fabricated consent, identity, loading or event-attempt counts.
- Optional Preview remains installed but unloaded/unbundled in the shell. Later
  initialization uses public evidence and Runtime's lazy initializer; the Preview
  package is frozen and must not be edited or bypassed through private imports.
- Serve only generated `dist` on loopback, with API-free health and proper missing
  asset errors. Keep generation/cleanup inside this app, preserving source and `.env`.
- Manage only `experiences-react-sdk-app` on default port 3400. Stop before setup;
  never manage unrelated PM2 processes or add bespoke process runners.
- Validate with scoped build/lint/typecheck and direct maintained-app inspection.
  Add no network unit tests, MSW, E2E tooling, service fixtures or temp consumers.
  Do not claim shell checks prove later runtime/rendering functionality.

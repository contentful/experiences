# React SDK rendering reference

Official support is one Experience fetch per page, without code enforcement.
Reference multi-ID loops exist only to compare rendering scenarios, not as
supported product usage or a cross-fetch guarantee.

- Read this app's README and parent implementation guidance before changes.
  Extend the permanent app in place. Application-owned free fetching and
  supplied-plan rendering remain supported alongside managed content/events/preview.
  Do not bridge unavailable capabilities with fake controls, loading or orchestration.
- Keep the app private and outside npm workspaces. Use the existing installer,
  installed local tarballs and internal-chain overrides; no workspace aliases,
  private package imports, Next dependency or temporary consumers.
- Use public React `/client` for browser integration and `/server` for static/server
  integration where applicable. Use the standard attributed renderer, ordinary
  HTML attributes/ref forwarding for single roots (React `forwardRef` for React 18
  compatibility), and real delivered slots. Named root bindings are optional for
  advanced/multi-root components; keep SDK binding types out of plain presentation
  components. Preserve the typed `ReactNode[]` slot with
  `Omit<HTMLAttributes<HTMLElement>, 'slot'>`.
- Use per-kind `trackViews`/`trackHovers`/`trackClicks` flags: undefined inherits
  Web automatic defaults and false disables that kind while retaining attribution.
  Keep all three false in the manual-view section to preserve its all-automatic-off
  behavior. Fragment-only card clickability belongs in a registration wrapper using
  public node context, forwarding `data-ctfl-clickable` without extra DOM wrappers.
  Use a registry-bound managed root, context-based manual registration
  with SDK-normalized `onNodeRoot` data and returned cleanup, independent consent
  controls and early attempt diagnostics. Keep startup consent/profile defaults
  unset. Keep the owner and attributed roots alive for Web's final hide drain;
  document teardown releases them. Deliberate unmount/replacement within a live
  document uses renderer/provider cleanup; persisted pagehide retains ownership.
  Managed loading handles navigation, page/identify/reset/retry sequences and preview
  content. The provider/root exposes `handoff?: ExperiencesHandoff`;
  lifecycle consumes the complete operation
  using current browser route, with internal state application and optional-page replay.
  Use ordinary Web fetch for CSR and browser-local actions. Optional handoff
  consumption is mode agnostic and consumer supplied only for actual server transfers.
  Same-ID Retry and later comparison IDs use ordinary event-free fetch without
  builders/hooks/replay. No local CSR/navigation producer or new API family applies.
  Preserve pinned ownership, blocked-event rules and the page consent-retry exception.
- Use `Experience experience={plan}` for supplied presentation without fetch,
  resolution, preview binding or managed page sequencing; use `experienceId` with
  optional `initialPlan`/`initialError` only for managed loading. Keep those prop
  modes exclusive.
  Presentation notifications run after commit and can report errors alongside usable
  data. Loading/error fallbacks accept nodes or full-result functions; custom
  children retain the full result. Check `useExperiencesContext().isLive` before
  concrete SDK operations. `initialPagePayload` supplies static `PageViewBuilderArgs`;
  explicit `buildPagePayload` takes precedence. Preserve event-free content Retry.
- Keep one primary `useManagedExperience` result as the content owner and render
  its plan through the supplied renderer, including repeated presentations.
  Do not mirror the primary plan in application state. Later comparison plans seed
  managed mode with `initialPlan`/`initialError` after the event-free comparison loop
  settles. Seeded failures retain preview bindings without a duplicate startup
  fetch; explicit commands can recover. Managed diagnostics/errors/empty content
  must use the current `children(result)` value, while primary presentation uses
  the page-owned result. Keep this on the existing seed/controller lifecycle.
  Use the typed live context for concrete SDK operations without casts. Keep URL
  and visitor intent together in Navigation, the SDK root alive across ordinary
  navigation and the synchronous attributed-DOM gap before reset.
- Keep bootstrap in `main.tsx`; use focused App, Navigation, PageShell, ContentPage,
  ConsentControls and presentation components. Do not embed the application tree in
  the entrypoint or introduce an application action queue. Disable visitor actions
  while initial content is pending. Validate Rich Text with the maintained
  `validateRichTextDocument` before rendering; do not add a custom recursive validator.
- Preserve `.env`; read only this app's file. Keep `.env.example` credential-free.
  Project browser configuration through the explicit allowlist, escape inline
  JSON and disable Vite environment exposure. Never print credentials or copy
  management/server-only preview settings into browser config.
- Keep default Experience IDs and optional overrides aligned with Web. Profiles
  remain SDK-owned; never add manual profile entry or an app store.
- Preserve Web theme provenance/license, Utilities/split layout and ordinary
  Home/Page Two links. Describe available rendering truthfully without fabricated
  consent, identity or event-attempt counts. Loading/error displays must
  reflect the actual application-owned content request.
- Optional Preview uses the public lazy initializer and ordinary managed rendering.
  Activate only with app-local `LIVE_PREVIEW_ENABLED=true` and a nonempty URL
  `preview_session_id`. Keep `LIVE_PREVIEW_SESSION_ID` only as an unread local
  convenience value; leave both fields blank in `.env.example`. Explicitly pass
  `isPreview: false` for all inactive cases, including disabled flag plus session
  URL, so normal event handling and sidebar notifications remain eligible.
  Disabled production builds exclude its chunk; enabled configuration exposes only
  browser-approved token/session settings. Use the installed Preview package's
  public exports without bypassing them through private imports.
- Serve only generated `dist` on loopback, with API-free health and proper missing
  asset errors. Keep generation/cleanup inside this app, preserving source and `.env`.
- Manage only `experiences-react-sdk-app` on default port 3400. Stop before setup;
  never manage unrelated PM2 processes or add bespoke process runners.
- Validate with scoped build/lint/typecheck and direct maintained-app inspection.
  Add no network unit tests, MSW, E2E tooling, service fixtures or temp consumers.
  Do not claim static checks prove live content or runtime behavior.

# Reference implementations

Use Optimization's corresponding reference implementation as the example. Keep
SDK operations in the public runtime and justify every departure from that example.

Standalone apps: [Node](./node-sdk/README.md), [Web](./web-sdk/README.md), and
[Node + Web](./node-sdk+web-sdk/README.md), plus the
[React reference](./react-sdk/README.md) and
[Next.js App/Pages reference](./nextjs-sdk/README.md). Root `npm run implementation:install`
prepares all registered implementations through their existing Nx setup targets; stop running apps with
their scoped lifecycle targets before refreshing dependencies.

References supply literal page/optional URL identify arguments in ordinary Node/Web
`personalization.events`; the SDK builds admitted arguments once and also accepts
raw built events. SSR uses ordinary Node fetch; CSR and browser-local navigation/
actions use ordinary Web fetch. Only the actual hybrid server response uses Node
`fetchExperienceForHandoff` with third argument `{ routeKey }`, returning a full
handoff plus optional plan/error for optional explicit browser consumption.
Normal fetch requires no handoff; no Web producer or Node aggregate commit remains.
Usable server replay survives content failure and browser admission is independent
of SSR display. Direct event APIs are callable, not prerequisites or compensation.

XDA always invokes Personalization API preflight and does not commit. SSR/CSR noncommit is a
tolerated service bug awaiting upstream force-commit support, with no current flag
or SDK workaround. Content Retry uses ordinary fetch of the same ID without events,
builders, event hooks or replay; accepted incoming replay delivery retry is queue-owned.
Reference-only later IDs use ordinary event-free fetch. See the
[canonical Runtime contract](../packages/runtime/README.md#xda-preflight-and-profile-finalization).

Browser handoff operations preserve live-profile/provider/handoff identity capture
before hydration and ordinary provider-first policy under Optimization PR #549 at
`f76f1ff04df1b466c98fc6ce5db6b569f9212438`. Browser continuity may supersede
the XDA ID; exact replay does not guarantee the same target, response or selection.

Web retains accepted replay identity across newer initialization within the owner
lifetime. After A is admitted and B becomes current, a serialized A is refused for
both page and nonpage batches, without reapplying state, republishing events,
recommitting or starting page fallback. Calls joining current A share its owned work.
New visitor/action intent must carry fresh message IDs. Reset/destroy clear owner
admission history; event-consent withdrawal purges permitted queued work without
forgetting accepted replay identity or restoring accepted/blocked intent on grant.
This admission guard provides no durable or exactly-once transport guarantee.

Automatic fetching, resolution and management of one primary Experience is the
normal React/Next workflow. The Next reference demonstrates it at
`/single-experience` and `/pages/single-experience`, alongside diagnostic routes.
App/Pages bind `config` and `resolveOptions` once; server families expose
`request.loadExperience`. Pages client bindings export top-level `ExperiencesRoot`,
`ExperiencesAnalyticsRoot`, `Experience`, `ExperienceRenderer` and
`useManagedExperience`, with no client `request` family. Export those components
once from a client configuration module and import named components for plain
`<ExperiencesRoot>` JSX. Bind flat browser SDK options, `consent.clientDefaults`
and `cookie`; lazy server-derived reference configuration may supply flat runtime
root props. Pages `Experience` accepts a complete `result` or existing managed
props. App retains its request components and built-in roots. Hydration is `preserve-server` or
`server-only`; server-only updates use server round-trips without browser content
loading. Browser roots inherit scope/locale, not private credentials; supply
explicit browser Delivery credentials or a trusted proxy, even for analytics-only
use under the existing Runtime requirement. Advanced preview/callback setup belongs
in client modules. Next bindings accept `livePreview: { enabled, loadImplementation }`
and own session inference, replacement and mode changes; do not add consumer
preview-only wrappers/hooks/keys. Request results carry loader-free preview configuration; roots derive sessions
from existing route/descriptor data. Request history survives owned SDK replacement.
The server and browser use matching deployment policy and separate credentials. `request.pagePayload` becomes `result.initialPagePayload`; pass
the complete result without overlays and retain the `requestId` history guard.
`composeRequest` permits application-owned diagnostic composition on the same
facade. Do not add multi-prefetch/result lists, identity reconciliation or new
controllers/cache/barriers.

Official support is one Experience fetch per page. The SDK does not enforce this
limit in code. Reference implementations fetch multiple IDs only to compare
rendering scenarios; their ordering, identity and result handling are application-owned
diagnostic behavior, not a supported product pattern, and provide no multi-Experience
or cross-fetch guarantee. Reuse plans
for repeated presentations. Retry/refresh creates or submits no new visitor events
and does not rerun event hooks. Standalone Identify and custom track are fresh
nonpage inputs to ordinary fetch. Initial URL intent pairs identify with the initial
page; navigation builds page intent without repeating initial identify. Page Two's
CUSTOM TRACK action is nonpage, while navigation to Page Two still builds a page.

Follow the [Runtime aggregate contract](../packages/runtime/README.md#shared-handoff-primitives).
Do not add standalone Personalization API preparation, separate supplied-data producers or public
state-only hydration. Hydration/storage/admission do not prove commit; preserve
Personalization API retry ambiguity and existing browser transport limits.
See [XDA preflight and profile finalization](../packages/runtime/README.md#xda-preflight-and-profile-finalization)
and the [Node personalization contract](../packages/node/README.md#personalization).

Managed React roots/loaders/page bindings adapt Optimization source/presentation
ports to XDA-built events without requiring
`beforeInitialPage` direct emission. Preserve Optimization's page consent-retry
exception in that managed flow.
Add focused maintained no-network unit/contract tests for optional-page replay,
consent/preview/schema, content failure, Retry retention, full aggregate ownership
and stale/reset/destroy guards, without MSW, E2E or server simulations.
Throwaway verification code must not change
reference use cases or create maintained consumers/apps.

## Optional Preview Sessions

Use conditional Node/Web `livePreview` initialization from the installed optional
package. Branch on `isPreview` before visitor work; destroy Node request facades
in `finally`. Web uses `fetchExperience()` then `subscribeToPreview()` for updates
and `states.preview` for status; hybrid retains SSR plans/DOM without a startup
refetch or profile handoff. Release subscriptions on route
replacement/final exit, retaining them for BFCache. Preview content must not write
identity cookies. Keep `.env` intact and browser config explicitly allowlisted.
Build and host both read app-local `LIVE_PREVIEW_ENABLED` from `.env`; preserve
tarball setup and pack the existing optional preview artifact without rebuilding it.
Every app retains `LIVE_PREVIEW_ENABLED` and `LIVE_PREVIEW_SESSION_ID` in local
`.env`; leave both fields blank in `.env.example`. The session ID is an unread
convenience value for copying into the URL, never a default or browser projection.
Activate preview only when the flag is exactly `true` and the URL contains a
nonempty trimmed `preview_session_id`. Missing/empty URL session or a falsy flag
keeps ordinary event handling, even with a nonempty session parameter. Pass
`isPreview: false` explicitly to browser owners in inactive cases, overriding
automatic URL detection. Sidebar attempts remain subject to normal consent and
identity requirements; they must not be suppressed by an inactive preview URL.
See each app README and [Runtime limits](../packages/runtime/README.md#shared-limitations).

All reference implementations use the same hard-coded default Experience IDs:

- `3fLAdFb3BYAuImRhcW8k4t` — Coded Experience
- `4WzbgzPQHa9Tr2ffbOU8p7` — Composed Experience
- `7u2eP09B4BIBToH8UwSHck` — Personalized Composed Experience

An implementation-local override is optional; configuring IDs must not be required
to use the reference data. Keep implementations standalone rather than adding a
shared runtime configuration dependency. Profile IDs are distinct: they must come
from Personalization API/XDA responses and remain SDK-managed, with no manual entry.
An XDA-returned ID alone does not establish a committed profile.

## Content typing

Use the SDK's types for render-plan structure and generated content types for source
content fields. These describe different parts of the integration and should be
combined rather than duplicating the source content model in handwritten interfaces.

`npm run mocks:generate:ctfl:types` generates CDA declarations from the space export
and copies `contentful-generated.d.ts` into implementation source directories. Do
not hand-edit those files. The installed generator requires Node 24+. Consumers
using its declarations must declare the referenced type dependencies locally;
workspace dependencies must not mask a missing implementation dependency.

### Determine the binding contract from configuration

Bindings are maintained in the admin interface and may change. Do not treat a
particular field mapping or source content type as a permanent convention. Determine
the contract from the space configuration and confirm the delivered shape:

1. Inspect `lib/mocks/src/contentful/data/space/ctfl-space-data.json` for the intended
   space/environment. If it no longer reflects admin configuration, obtain a fresh
   export through the existing maintenance workflow. Do not hand-edit the export
   or change admin bindings as part of implementation work.
2. Locate the Experience and follow its slots to the rendered fragments. Inspect
   their component/template references and relevant `optimizationVariants`, since
   variants can bind different entries or values.
3. Follow each `contentBindings.sys.urn` to its data assembly. Inspect the supplied
   parameters, including entry resource links and literal values; follow parameter
   references rather than assuming every value comes directly from an entry.
4. Read the data assembly's parameter constraints, resolver queries, and `return`
   mappings. Trace `$parameters`, `$resolvers`, `$from`, and selection paths to
   determine source fields, aliases, wrappers, and projections. Follow nested
   data-assembly resolvers where present.
5. For bound entries, look up `entries[].sys.contentType.sys.id` and the corresponding
   `contentTypes` definition. Cross-check allowed content types and query type
   conditions, then locate the matching generated declarations. Obtain field value
   types from the generated entry type's `fields`, not directly from
   `EntryFieldTypes` schema markers. Consider all allowed source types, not only
   the currently selected entry.
6. Follow component/template `contentProperties` and composed `componentTree`
   mappings to the final coded nodes. A data assembly's output names may be mapped
   again before they become renderer-facing properties.
7. Confirm the result through the public SDK's fetched plan: inspect each node's
   registration, `props.content`, and nested slots. Use configuration to establish
   allowed shapes and delivered data to confirm actual representation; one response
   does not establish every variant, collection, or nullable case. Investigate
   differences instead of forcing the response into an assumed type.

Generated CDA types cover source fields, not the entire transformed binding output.
A binding-output type can derive its value types from those generated fields while
expressing the determined property names, wrappers, transformations, optionality,
and nullability. Keep this tracing work outside the application's runtime: the
reference must not read the management export to render content.

### Current SDK limitation and intended support

`PortableRenderPlan` types nodes, registrations, slots, and metadata, but
`PortableRenderNode.props.content` and `ResolveContext.content` remain
`Record<string, unknown>`. The SDK currently cannot carry a consumer's generated
or derived content types through fetch/resolve results and resolver inputs.
Adapter `defineComponent<Props>` registrations type presentation props and resolver
outputs; they do not specialize the incoming content. Do not describe a plan type
or a passing application typecheck as proof that all content fields are typed.

We intend to address this deficiency in a future SDK update by allowing consumers
to supply content types per component and Experience Template registration and
preserving those types through plans, nested slots, fetch/resolve APIs, and
resolver inputs. Existing consumers must retain the default unknown-valued
behavior. Source content types, bound content properties, and final presentation
props must remain distinct. The public API for this support is not yet available.

Future generation tooling could derive binding-output types and registration maps
from source schemas and configured bindings, reducing manual mapping. Do not build
a custom generator or duplicate SDK typing infrastructure inside a reference
implementation to compensate for the current limitation.

The Node reference's EJS templates are not checked by TypeScript. Typing data in
the server does not check property accesses in those templates, and supplying a
type argument or assertion does not validate live content against admin
configuration. Preserve the agreed rendering approach; adding template tooling or
runtime validation requires separate scope. Exercise consumer-supplied typing in
reference implementations when the SDK supports it and the rendering path can
demonstrate the intended compile-time guarantees.

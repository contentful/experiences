# @contentful/experiences-runtime

> **Internal package.** The public Node and Web SDKs consume this shared runtime. Framework adapters re-export its `EventBuilder` API but do not construct the runtime.

Runtime owns the shared `ContentfulExperiences` base, the complete `EventBuilder` implementation and argument schemas, event metadata, runtime-only Delivery and Preview client construction, direct Optimization transport, event methods, and the current Node-to-Web handoff contract. Node binds request-local state; Web owns browser locale, context, and persisted profile state. Runtime itself does not retain those per-request or browser values.

Web exposes
its browser state through `states` observables and owns the module signals and
persistence, consent, and connectivity effects; Node retains its request-local
profile getter. Runtime supplies the `PersonalizationRequestState` transport outcome
type, while the Web leaf owns its observable value.

The shared base and Node do not impose a singleton restriction. Multiple Node instances can coexist, and each `forRequest()` facade belongs to its creating instance. Web owns a `globalThis` lock allowing one live Experiences Web SDK per JavaScript runtime. Its `destroy()` stops browser-owned work before releasing that lock.

Client remains the lower-level Delivery and free-function boundary. Runtime imports `ContentfulViewDeliveryClient`, `fetchExperiencePayload`, host constants, and XDA-derived request types from `@contentful/experiences-client`. Client has no dependency on Runtime. It supplements generated XDA validation only for
`context.gdpr.isConsentGiven` (boolean) and optional `context.page.title` (string),
using local primitive constraints in `zod/mini`. Existing XDA event/context
contracts and the generated passthrough result are preserved. Core remains dependency-free.

## Shared base

Construct `ContentfulExperiences` with a space, environment, Delivery configuration, and an `eventBuilder` configuration with an explicit platform `channel`. Preview and Optimization configuration are optional. The base creates and owns its Delivery, optional Preview, and Optimization clients. Fetch and resolve operations, including Node's `fetchExperienceForHandoff`, require `{ config: resolverConfig }` as a per-call resolve option, so one SDK can interpret different Experiences independently. Event-only construction requires no resolver registry. Metadata and debug defaults may still be configured on the SDK. By-ID fetches use Delivery; leaf owners use the configured Preview transport for active Preview Session snapshots. Destination acquisition uses Delivery, then active leaf Preview Sessions may replace the selected payload only when its actual Experience ID matches and the configured environment is `master`, the Destination scope. Redirects are terminal.

The readonly `api` property exposes the full Personalization and Analytics service
clients as `api.personalization` and `api.analytics`, with their shared `api.config`;
readonly `config` retains the typed configuration supplied
by the public leaf. Delivery and Preview clients remain internal to Runtime.

Delivery and Preview options accept a token or token supplier. A tokenless trusted proxy requires an explicit `host` and disables generated bearer authentication. Endpoint precedence is explicit `host`, then the generated client's `environment`, then the Delivery or Preview default. `environmentId` is the Contentful environment identifier used by by-ID requests, not the generated client's endpoint-valued `environment` option.

The base owns one `EventBuilder`, configured with a default library identity of `@contentful/experiences-runtime` when a leaf does not supply one. Node and Web supply their own library metadata. The builder's schemas, defaults, IDs, timestamps, context assembly, consent metadata, and event construction are colocated here. `identify`, `page`, and `track` use Personalization; view, click, hover, and flag-view events use Analytics. Node prepares one noncommitting request handoff batch. Web uses the Runtime-owned `PersonalizationDelivery` sender for ordinary online/offline events and imperative prepared-batch admission.

Event methods build and validate arguments before consent admission or a
missing-profile drop. `trackView` follows Optimization's early consent guard
before its view-specific validation. Node and Web run event interceptors after the original consent gate and before
wire-event revalidation. Valid transformed events pass a second gate using their
final type and current consent before publication, transport, or queue admission.
Invalid output is a schema failure rather than a consent refusal. Post-hook
blocks report the transformed method/type; every event method returns `{ accepted: false }`. Node sends
directly. `BlockedEvent.method` is typed as `string`, matching
Optimization's public event payload contract.

XDA plans retain the complete response profile in `plan.personalization.profile`.
Core mirrors Delivery's profile shape without adding a runtime dependency. Node and Web
validate and adopt that snapshot for subsequent requests and Analytics. Node request
identity may be ID-only, while Analytics and browser profile state require complete
snapshots, following Optimization at `e19139ac47619988b9db0e312cc37bb7c4fdaf89`.
Personalized plans contain visitor-specific data; keep their serialization and caching private.

The generated Experience Delivery dependency is declared only by Client. Runtime directly declares its Optimization API client, `es-toolkit`, and `zod` dependencies. Its package metadata is injected into `sdk-info` during build and checked by `verify-release-artifact`.

Direct Experience and ExperienceFragment interaction builders use `default` when `variantId` is omitted or empty. Fragment builders also use `default` when `parentVariantId` is omitted or empty; a supplied root Experience variant remains separate from the Fragment's own variant. Experience builders leave omitted parent fields unset.

See the [Node](../node/README.md), [Web](../web/README.md), and [root paired replay guide](../../README.md#paired-server-to-browser-replay) for the current public operations and handoff handling.

## Custom flags

`resolveFlagChange(name, changes?: readonly unknown[])` returns the last valid
matching Optimization `Variable` record, retaining its attribution metadata and
normalizing its `value` to `Json`. Invalid records are ignored; missing flags
return `undefined`. Resolved values include JSON scalars (including falsy values),
objects, arrays, and `null`. Optimization's `{ value: object | array | null }` wrapper
is unwrapped. Runtime exports the helper and `Json`, `ChangeArray`, and
`VariableChange`; the framework adapters re-export them. Node and Web re-export
the helper and the types.

The current structured `value`-property heuristic also unwraps authored JSON with
that shape, dropping sibling fields. The API schema cannot distinguish a legacy
wrapper from authored JSON; an authoritative wire contract is needed before
narrowing this behavior.

The base `getFlag(name, changes?)` returns only the resolved value and is pure:
it retains no changes and emits no exposure. Web adds browser-owned state and
exposure through the [existing flag-view method](../web/README.md#custom-flags).
Custom flags add `flag(name)` to `States` and `getFlag` to Web's presentation
`ExperiencesRuntime` contract. XDA fetches and direct Personalization responses
feed the same browser flag-state path; supplied changes replace the snapshot,
`[]` clears it, and omission retains it unless profile identity changes. This
complete-snapshot interpretation follows Personalization API/Optimization and remains an
assumption pending live-backend verification. Node carries returned changes in
private handoffs without retaining global flag state.

## Optional runtime Live Preview

The single `preview` configuration contains Preview API transport credentials and
optional session settings. Node request contexts supply `preview: { sessionId }`;
Web infers the session from the standard `preview_session_id` browser query
parameter. Session identity is request-local and is never configured on the shared SDK.
Configure optional
`createClient: createLivePreviewClient` alongside the Preview credentials when
browser live updates are needed. It accepts the optional package's synchronous
factory with structural type
`(options: PreviewClientOptions) => PreviewClient`.
Factory options contain `spaceId`, `environmentId`, `sessionId`, `previewToken`,
and optional `sessionHost`, `resourceResolution` and `debug`. The factory returns
the client itself synchronously. Lazy package imports belong to
the application before SDK construction.
There are no per-Experience session options. Node opens no socket; Web owns one
connection for its active editor session. Node accepts the same shared Preview
configuration, but snapshots do not require `createClient`; the request supplies
its session explicitly.

The frozen package exposes one current Experience payload per session and does
not select by Experience ID. Runtime's owned Preview client therefore reads raw
snapshots so Node/Web can check `payload.sys.id` before resolving them for a caller.
Only the current successfully acquired raw snapshot determines that match. A
mismatched or missing ID uses ordinary Delivery. Snapshot acquisition failure rejects
before identity is known, so it can affect all by-ID requests in the preview context;
there is no automatic fallback to published content on failure. One Experience per
page remains recommended. Node retains a successful request-local snapshot and permits
retry after acquisition failure; Web shares only in-flight snapshot acquisition.
Managed views retain existing usable content while pending or failed. Web subscriptions
use the same identity check; payloads without an ID are never broadcast to arbitrary
Experiences. Snapshot HTTP errors surface through the fetch or managed result;
`states.preview` reports connection/update state and errors.
`createPreviewClient` evaluates token suppliers and passes the session options
to the configured factory, without requiring
the optional package as a Runtime dependency. Registries and resolve options stay per call.

### Preview Session query binding

Runtime exports a pure query parser, also re-exported by the public Node SDK.

The parser and type are also available from
`@contentful/experiences-runtime/preview-session-binding`, an isolated entry that
does not load event schemas or other runtime modules.

```ts
export type PreviewSessionBinding = Pick<
  PreviewSessionOptions & { experienceId: string },
  'experienceId' | 'sessionId' | 'sessionHost' | 'resourceResolution'
>;

export function getPreviewSessionBinding(
  defaults: Omit<PreviewSessionBinding, 'sessionId'>,
  searchParams: URLSearchParams
): PreviewSessionBinding | undefined;
```

The parser trims the first `preview_session_id` and `preview_experience_id`
query values. A missing or empty Session ID returns `undefined`; a missing or
empty Experience override uses `defaults.experienceId`. Supply a valid default
Experience ID. The result is a fresh binding containing the selected IDs and
only the optional `sessionHost` and `resourceResolution` from defaults when defined. Other
query parameters are ignored; inputs are neither mutated nor retained.

There is no environment fallback, default Session ID or legacy parsing path.
The helper reads no globals, performs no network work and does not load the
optional preview package. Applications select deployment policy, supply
the browser `createClient` factory and own session/mode lifetime. Consumers with known IDs
can supply the session directly through Node's request `preview` option. Web's thin wrapper uses the same
argument order, with optional query parameters defaulting to the current
browser location only when invoked.

### Shared limitations

- Runtime-owned snapshot HTTP supports Preview tokens (including suppliers), a tokenless
  trusted proxy with explicit `preview.host`, and the generated client's transport options.
  Endpoint precedence is `preview.host` → `preview.environment` → Preview default.
  The optional WebSocket factory still requires a resolved `preview.accessToken`;
  `sessionHost` and `resourceResolution` are mapped to its options.
- Session locale, parameters, and extensions are server-owned. Snapshot HTTP supplies
  no per-call cancellation. Runtime's `fetchPreviewSessionPayload` returns raw
  `ExperiencePayload`; owners check `payload.sys.id` before resolution and discard stale results.
  The optional package's standalone `fetchPreviewSession` returns resolved plans.
- Reconnects reuse the client's token; token rotation requires client replacement.
  Protocol `error` frames are logged by the package but are not published through
  `getResult().error`, so SDK error state cannot report them.
- HTTP/socket data share no revision or initial-frame marker. Web counts payload changes
  locally; it cannot identify an unchanged initial socket frame. SSR refresh consumers
  may therefore refresh initially. Keep subscriptions stable across content refreshes.
- CJS hosts use dynamic `import()`; browser UMD hosts need a bundled ESM asset.
  Production asset exclusion requires a build-time flag.

### Integration trade-offs

These costs follow from the current public package surface. The Preview team can
decide whether reducing them warrants additional package or protocol support.

| Package surface                                                                                     | Integration cost                                                                                                                                                                                                                    | Trade-off for consideration                                                                                                   |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| String credentials/endpoints; no injected transport or client reconfiguration                       | [Runtime](./src/live-preview.ts) evaluates SDK suppliers before calling a factory; [Web](../web/src/preview-session.ts) replaces the client for session/token changes.                                                              | Supplier or transport support could reduce adaptation, with more authentication and lifecycle semantics in the package.       |
| Standalone `fetchPreviewSession` returns plans; subscriptions and `initialPayload` use raw payloads | [Runtime](./src/live-preview.ts) fetches raw snapshots through its owned HTTP client so [Node](../node/src/contentful-experiences.ts) and [Web](../web/src/contentful-experiences.ts) can match `payload.sys.id` before resolution. | Optional raw snapshot access in the Preview package could centralize this path while retaining convenient resolved snapshots. |
| Snapshot helper has no `AbortSignal`                                                                | [Node](../node/src/contentful-experiences.ts) and [Web](../web/src/contentful-experiences.ts) discard obsolete results; HTTP work continues.                                                                                        | Cancellation support could stop wasted HTTP work; caller/resolver lifetime checks would still be necessary.                   |
| Separate result/status subscriptions; retained payload with no clear operation                      | [PreviewSession](../web/src/preview-session.ts) combines state and remembers the last client payload so status notifications cannot undo SDK reset.                                                                                 | A combined result or clear operation could reduce this bookkeeping, with more package-owned state semantics.                  |
| No shared snapshot/stream revision or initial-frame identity                                        | Web uses a local payload sequence and cannot skip an equivalent first socket payload reliably.                                                                                                                                      | Shared identity could avoid redundant initial work, but may require server/protocol changes as well as package changes.       |
| Unbundled ESM distribution                                                                          | The [Web](../../implementations/web-sdk/scripts/build-assets.ts) and [hybrid](../../implementations/node-sdk+web-sdk/scripts/build-assets.ts) references prepare browser assets; CJS hosts use dynamic import.                      | Additional distribution formats could reduce consumer setup at the cost of more package build/release maintenance.            |

Lazy opt-in, structural types, URL/Experience binding, event/profile suppression,
in-flight sharing, SSR serialization, rendering and caller cleanup remain SDK/app
responsibilities. Web reports connection status to the editor automatically; consumers supply only
the package’s client factory. Session-owned locale/parameters/extensions and unpublished protocol errors
are limits we respect; the SDK adds no protocol workaround for them.

## Shared event interceptors

Runtime owns `InterceptorManager`, `Interceptor`, `InterceptorMerge`,
`MaybePromise`, and the `OptimizationEventStreamEvent` union and exports them
from its root. Node and Web re-export the same public names. The manager snapshots
handlers for each run, clones inputs, awaits handlers in insertion order, and
propagates handler errors. Node owns one event registry shared by its request
facades; request state remains facade-local. Web keeps its existing event and
state registries. Runtime owns no browser signals or state-interceptor registry.

A chain runs once per admitted submission or prepared event. Node/Web validate
admitted XDA input, then immutably stamp owner event consent before interception.
Hooks may explicitly transform valid metadata, following direct-event policy.
Ordinary Node/Web XDA fetch uses `Promise.all` across event chains while preserving
result order. The actual Node transfer producer runs event chains sequentially,
matching Optimization preparation. Destination validation precedes the final-type
consent check.
Valid consent-blocked XDA events are omitted without cancelling content fetching;
hook/schema failures reject before transport; content fetch/resolve failure after
finalization retains usable replay. Pages are optional and never synthesized. Retries and browser
prepared replay never rerun event hooks; browser replay still applies browser
consent and its metadata. Hooks preserve the existing transport boundaries, and
stateless free fetch functions gain no global registry.

## Shared handoff primitives

Complete-operation ownership follows the pinned Optimization reference while
preserving XDA consumer-supplied intent. Optional-page replay and explicit-only
page intent prevent inventing an event absent from the consumer's XDA evaluation.

The full `ExperiencesHandoff` aggregate carries scope, cache policy, optional
profile, changes, continuation identity and final Client XDA events for optional replay. The actual server Node producer
is its XDA producer. Necessary state application is internal to the complete
Web `hydrateAndTrackCurrentPage` operation. Create/parse/validation primitives
validate untrusted scope, cache safety, event schema, count and order on receiving
paths without sending or mutating owner state. The Node producer captures final
Client events unchanged; it adds no replay-compatibility validation before XDA. Replay permits identify/track-only events with
one optional final page, retaining SDK limits of 100 total and 50 identify events.
These are handoff limits, not asserted single-profile endpoint limits.

Ordinary Node/Web fetch accepts existing type-tagged builder arguments or raw
built events, with SDK-owned construction once. Only an actual Node-to-browser
transfer produces a handoff; Web/React optionally consume the explicitly supplied
aggregate. Content Retry uses ordinary event-free fetch. See the canonical
[XDA contract](#xda-preflight-and-profile-finalization) for flows and replay rules.

Web's shared state-application helper also serves the public
`@contentful/experiences-web/bridge-support` entry. It applies profile and changes state
through Web's state interceptors and atomically marks the request state successful,
including for profileless hydration; a profileless handoff leaves current profile
continuity unchanged. This helper does not run as part of an XDA content fetch.

Cache warnings are advisory; `assertExperiencesCacheSafety` and the create/parse operations reject a public or static handoff containing a profile, changes, continuation ID, or replay. `public-permutation` requires a nonempty application-owned key covering Experience identity and content revision, environment, locale, and every dimension that changes rendered output. A `static` handoff without profile or changes needs no key. Runtime does not set response headers or prove that application-rendered content is safe to cache.

Handoff `state.changes` is optional and validated with the Optimization API's
`ChangeArray` schema. Any supplied changes, including `[]` without a profile,
require private-request cache scope.

The aggregate packages a complete evaluated API profile in `state.profile` and
retains continuation identity in top-level `profileId`; ID-only continuation does
not supply browser profile state.

Public-permutation metadata may carry optional `tags`, preserved by canonical
handoff parsing. Tags must be nonempty strings; the consuming Next adapter applies its count,
length and HTTP delimiter limits.
Framework limits, HTTP headers and invalidation remain with the consuming adapter
and application; Runtime supplies no cache engine.

Profileless internal state application preserves existing browser continuity;
supplied changes replace flag state.
It does not commit preflight results or transfer selected-optimization state.
No 64 KiB cap or version field applies to the aggregate or `PortableRenderPlan`;
callers own safe serialization and response-size policy.

## Destination selection

Configured-space `fetchExperience` accepts exactly one selector: `{ experienceId }`,
`{ destinationId, path }`, or `{ destinationId, nodeId }`. The by-ID overload
returns a plan; destination and union overloads return a plan or `{ redirect: { path } }`.
`fetchByDestinationPath` and `fetchByDestinationNode` remain convenience wrappers.
All selectors accept `locale` and Runtime's builder-or-built `personalization.events`.
Destinations are master-only and do not accept by-ID `parameters` or `extensions`.
`plan.experienceId`, when present, comes from the acquired payload's actual `sys.id`.
No destination lookup cache or second by-ID fetch is introduced.

Destination service parity is incomplete: live verification found that destination
`preflight: false` did not finalize fresh event-bearing profiles, while the same
by-ID request did. Destination source-map requests also returned no source map or
node IDs while the by-ID control returned both. The SDK forwards the existing
personalization contract without emulating commitment; destination attribution
enrichment is unavailable. These upstream gaps block release of complete parity.

## XDA preflight and profile finalization

The generated dev.13 client exposes optional `personalization.preflight`.
Under the upstream contract, `true` previews events and profile changes without
committing them; `false` commits them. XDA defaults an omitted value to `true`.
Ordinary SDK and free-function fetches explicitly default supplied personalization
to `preflight: false`, for by-ID and both destination forms. An explicit per-call
boolean overrides that ordinary default; fetches without personalization do not
add it. Node's `forRequest({ preflight })` supplies an XDA-only request default,
with per-call `personalization.preflight` taking precedence. It does not change
direct event methods.

A preview-generated profile ID can be reused by a subsequent Personalization API
POST carrying events, through XDA or a direct event call. It remains provisional
until commitment: profile-only XDA uses Personalization API GET internally and
may return 404 for an uncommitted ID, even when the SDK-to-XDA request is POST.
Local Node/Web adoption, hydration, storage and queue admission do not prove
commitment. This contract is distinct from editor Preview Sessions; their policies
remain unchanged.

The active content flow is:

- **SSR:** ordinary Node request `fetchExperience`, without preparing or consuming replay.
- **CSR:** ordinary Web `fetchExperience`, without a locally produced handoff or replay.
- **Hybrid transfer:** Node request `fetchExperienceForHandoff(options,
resolveOptions, { routeKey })` evaluates actual server content and returns
  `FetchExperienceForHandoffResult`: a full `handoff` plus optional `plan`/`error`.
  An explicitly supplied server handoff is optionally consumed by Web/React.
  Browser-local navigation/actions use ordinary Web fetch unless a new server
  response actually supplies another handoff.

Ordinary Node/Web fetch accepts existing type-tagged `IdentifyBuilderArgs`,
`PageViewBuilderArgs` and `TrackBuilderArgs`, or raw built XDA events.
The SDK builds admitted arguments once, immutably stamps owner consent, intercepts
and validates before XDA. Client accepts raw built events and owns serialization.
Normal fetch requires no handoff. Direct event APIs remain callable, but are
neither an initial rendering prerequisite nor compensation for XDA noncommit.

Ordinary SSR/CSR event-bearing fetches request commitment through XDA with
`preflight: false`; an explicit `true` opts into evaluation without commitment.
Do not introduce Node aggregate commitment, a Web handoff producer, standalone
Personalization API preparation, or a new API family to compensate.

For an actual hybrid server-to-browser transfer, preflight is intentional:
Node fixes `fetchExperienceForHandoff` to `preflight: true` and rejects an explicit
per-call `false`, regardless of the request default. It evaluates content and
supplies the events for browser commitment with `preflight: false`. Node's
replay path is exercised only in that backend role; ordinary Node SSR has no
replay requirement. The existing Node + Web and Next references provide those
hybrid producer/consumer paths. Content display remains independent of replay
admission and successful delivery.

Ordinary SSR uses no replay workflow. Hybrid server evaluation retains preflight
followed by browser commitment; browser-local navigation/actions remain ordinary
Web fetches. Choosing Node alone does not identify SSR versus hybrid use. Next's
`request.mode` selects `'ssr'` or `'hybrid'` (default), while Web needs no mode setting.

**Verification and release gates:** The upstream contract above does not replace
live-service verification. All tracked XDA issues affecting the supported
integrations must be resolved, and deployed preflight defaults and override
behavior must be verified.
It must demonstrate full supported-event acceptance, real commitment and profile
finalization through the appropriate SSR/CSR and hybrid paths. The SDK will not
release until those issues are resolved and that verification passes against the
actual upstream contract. There is no known fix date.

**Analytics profiles:**
Optimization API client 2.2.3 requires complete profiles for Analytics batches,
including `stableId`, `random`, `audiences`, `traits`, `location` and `session`.
ID-only request identity remains valid for Personalization and content continuity;
Analytics requires a full snapshot supplied by the caller or returned by XDA/Personalization API.
Node throws `EventProfileRequiredError` without one; Web warns and drops the event.
Earlier service checks returned HTTP 400 / `ERR_INVALID_DATA` without those fields,
while complete Personalization API profiles produced HTTP 200 responses. The SDK does not
fabricate those fields or synthesize an initial commit. These observations do not
establish whether profile existence is validated; a complete snapshot does not
prove upstream commitment.

The Node producer is retained only for an actual server-to-browser transfer.
Its third argument is `{ readonly routeKey: string }` only, never an existing
`ExperiencesHandoff`. It retains finalized consent-gated/intercepted/validated
replay before content work, so content failure does not discard usable replay.
The browser commits the server-supplied replay through
`hydrateAndTrackCurrentPage(handoff, { routeKey, isCurrent })`, independently of SSR display
and without startup refetch or a complete-plan barrier. Do not reconstruct replay
from raw arrays, create local CSR/navigation handoffs, or use handoff as content input.

Content Retry refetches the same Experience ID through ordinary fetch without
events, builders, event hooks, publication, admission or replay. Ordinary refresh
and reference-only later-ID comparison likewise do not reuse evaluated events or
handoffs. Accepted incoming replay delivery retry belongs to the existing Web
queue and retains event IDs, target and locale; content Retry never resubmits it.
Identify/custom track actions supply fresh nonpage intent through ordinary fetch.
Page Two's CUSTOM TRACK action is nonpage; navigation to Page Two still supplies
a page event. Navigation does not repeat initial URL identify intent.

Official support is one Experience per page, unenforced in code. Reference
multi-ID loops compare rendering scenarios only: later IDs use ordinary fetch
without new events. They provide no multi-Experience or cross-fetch guarantee.
Reuse plans for repeated presentations.

Web/React optional handoff consumption is mode agnostic and explicit. Incoming
replay permits identify/track-only intent with one optional final page, at most
100 total events and 50 identify events. Nonpage replay never synthesizes a page
or marks a route tracked. A replay-less aggregate applies necessary state
internally and returns `{ accepted: false }` unless explicit `buildPayload`
supplies page intent. Consent refusal is terminal for the supplied replay batch:
blocked identify/track events are never restored on grant. For a still-current
page-bearing handoff after consent grant, skip that batch and fall through the
existing `trackCurrentPage` fallback if the page remains eligible under current
consent, route and lifetime guards. This is Optimization's normal implicit page
path, with no dedicated API, scheduler, controller, state class or mode detector.
Current React optional consumption subscribes to `sdk.states.consent` within its
existing effect and reinvokes that complete operation with one stable `isCurrent`
lifetime guard. Queue-capacity refusal remains retry-eligible while the complete
operation is unaccepted; accepted eligible
page fallback completes initialization without resubmitting the original refused batch. Accepted replay never triggers
fallback or application resubmission because delivery fails. Admission does not
prove delivery.

Capture browser replay target before hydration: current live profile, configured
anonymous provider, then `handoff.profileId`; ordinary requests remain
provider-first. Browser continuity can supersede XDA identity, so exact replay
does not guarantee the same commit profile, response or selection. Scope,
private-request cache safety, current receiving consent, schema, capacity and
owner lifetime still gate the complete operation. Consent restamping copies
events; finalized replay never reruns event hooks. Preview suppresses visitor work.

Retain accepted replay identity across newer initialization within the owner
lifetime: serialized A after B is refused without state/event republication,
recommit or fallback for page and nonpage batches. Calls joining current A share
owned work while any coalesced caller is live. Optional `isCurrent: () => boolean`
guards operation liveness, including SDK state application and replay admission;
omitting it leaves caller liveness unrestricted. A departing caller neither
destroys an injected SDK nor cancels accepted queue delivery. Reset/destroy clear
admission history; consent withdrawal purges
eligible queued work without restoring accepted/blocked intent on grant.
Supersession cancels pending work, not accepted queue delivery. Preserve operation
revision through asynchronous interception and admission/publication so stale
visitor work cannot publish after reset, consent withdrawal, supersession or destroy.

Optimization PR #549 at `f76f1ff04df1b466c98fc6ce5db6b569f9212438`
remains the pinned ownership, consent, queues and lifetime reference. XDA content
evaluation and the split between ordinary commitment and hybrid preflight require
the differences above; full commit parity still requires live-service verification.
Actual Personalization API delivery
retains generic retry ambiguity and no durable/exactly-once guarantee.

The default Web page provider includes `title`, `hash`, `width` and `height`.
Shared `buildPageView` retains the required `properties.title` string fallback.
Explicit page context, raw caller-built events and Node/Client metadata remain
caller-owned. The Next.js, SvelteKit and Angular example helpers include title in
explicit `context.page` input alongside `properties.title` and `context.gdpr`.

### Replay transport limits

The actual Node transfer producer captures raw final Client events unchanged,
including supported `context.page.query` arrays, and preserves available content.
Normal SDK-built events already pass Personalization API builder validation and Client XDA
validation; no additional server replay-compatibility validation is required before
XDA. Manually built/raw transmission remains the consumer's compatibility risk.
`ExperiencesHandoff.replay.events` uses a union of raw Client and normal SDK event
types in the existing wire contract, without a new DTO.

The receiving browser retains existing replay schema/order/count, capacity,
scope/cache/consent and lifetime checks. It may refuse unsupported replay while
available content remains usable. The pinned Personalization API client's schema/serialization
remains the commit boundary; wider XDA metadata/query arrays do not establish
exact replay compatibility. Add no SDK safety-validation layer, custom transport
or dependency upgrade.

Prepared event attempts publish only after the whole batch is admitted and before
transport begins; refusal publishes none. Preserve the original operation revision
through asynchronous interception and final admission/state publication, so reset,
consent withdrawal, supersession or destroy cannot admit or publish stale visitor work.

## Personalization delivery

`PersonalizationDelivery` shares one low-level Personalization transport with direct event methods. Ordinary online calls send directly and return response data; ordinary offline calls are accepted into an in-memory queue and may have no data yet. At capacity, the offline queue refuses a new ordinary event before publication, without evicting accepted events, matching the active Optimization baseline. Prepared batches are admitted whole or refused before publication; the queue never splits them. Prepared batches are validated again and admitted whole at an event-count capacity of 100 by default. The prepared-batch limit stays at 100 even with a larger configured queue; a smaller queue or insufficient remaining capacity can reject an otherwise valid batch. Admission returns before HTTP settles. Prepared batches keep their event bodies, IDs, captured transport locale, and selected target identity through retry. Ordinary queued events keep their event bodies and use the current SDK request locale when sent; explicit event locales never select the transport locale. Direct online calls do not wait behind them. Concurrent `flush()` calls, including forced calls, join the active drain until that attempt settles. Completion does not guarantee delivery or wait for scheduled future retries; forcing bypasses connectivity/backoff/circuit gates but never starts a second concurrent drain. The retry policy follows Optimization's backoff and circuit defaults without a periodic Personalization timer. `reset()` invalidates queued work and late publications, including an active destroy drain; `destroy()` refuses new work, then makes one best-effort attempt to drain queued batches in order without publishing late state or scheduling retries. A failed request stops the drain. This is neither durable persistence nor an exactly-once guarantee. Runtime event methods enforce event consent and persistence policy at their owning leaves; consent is also included as event metadata where supported.

Owner bindings may supply fixed `getIsPreview` intent. Shared event methods check it before
building or profile lookup and return `{ accepted: false, reason: 'preview' }`; request/browser
state remains in the Node/Web leaves.

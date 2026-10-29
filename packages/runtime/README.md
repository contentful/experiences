# @contentful/experiences-runtime

> **Internal package.** The public Node and Web SDKs consume this shared runtime. Framework adapters re-export its `EventBuilder` API but do not construct the runtime.

Runtime owns the shared `ContentfulExperiences` base, the complete `EventBuilder` implementation and argument schemas, event metadata, runtime-only Delivery and Preview client construction, direct Optimization transport, event methods, and the current Node-to-Web handoff contract. Node binds request-local state; Web owns browser locale, context, and persisted profile state. Runtime itself does not retain those per-request or browser values.

Web exposes
its browser state through `states` observables and owns the module signals and
persistence, consent, and connectivity effects; Node retains its request-local
profile getter. Runtime supplies the `ExperienceRequestState` transport outcome
type, while the Web leaf owns its observable value.

The shared base and Node do not impose a singleton restriction. Multiple Node instances can coexist, and each `forRequest()` facade belongs to its creating instance. Web owns a `globalThis` lock allowing one live Experiences Web SDK per JavaScript runtime. Its `destroy()` stops browser-owned work before releasing that lock.

Client remains the lower-level Delivery and free-function boundary. Runtime imports `ContentfulViewDeliveryClient`, `fetchExperience`, host constants, and XDA-derived request types from `@contentful/experiences-client`. Client has no dependency on Runtime. It supplements generated XDA validation only for
`context.gdpr.isConsentGiven` (boolean) and optional `context.page.title` (string),
using local primitive constraints in `zod/mini`. Existing XDA event/context
contracts and the generated passthrough result are preserved. Core remains dependency-free.

## Shared base

Construct `ContentfulExperiences` with a space, environment, Delivery configuration, and an `eventBuilder` configuration with an explicit platform `channel`. Preview and Optimization configuration are optional. The base creates and owns its Delivery, optional Preview, and Optimization clients. Fetch and resolve operations require `{ config: resolverConfig }` as a per-call resolve option, so one SDK can interpret different Experiences independently. Event-only construction and handoff preparation require no resolver registry. Metadata and debug defaults may still be configured on the SDK. By-ID `preview: true` requires a configured Preview client; destination operations remain delivery-only.

The readonly `api` property is the actual Optimization API client (`api.experience`
and `api.insights`); readonly `config` retains the typed configuration supplied
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

The generated Experience Delivery dependency is declared only by Client. Runtime directly declares its Optimization API client, `es-toolkit`, and `zod` dependencies. Its package metadata is injected into `sdk-info` during build and checked by `verify-release-artifact`.

Direct Experience and ExperienceFragment interaction builders use `default` when `variantId` is omitted or empty. Fragment builders also use `default` when `parentVariantId` is omitted or empty; a supplied root Experience variant remains separate from the Fragment's own variant. Experience builders leave omitted parent fields unset.

See the [Node](../node/README.md), [Web](../web/README.md), and [root paired replay guide](../../README.md#paired-server-to-browser-replay) for the current public operations and handoff handling.

## Optional runtime Live Preview

Applications supply the optional package's public exports through a lazy initializer.
Runtime exports structural types and wrappers without requiring that package: Node
owns request snapshots, and Web owns one preview source and its subscriptions.
`fetchRuntimePreviewSession` adopts the resolved plan; `createRuntimePreviewClient`
creates the public subscription client. Metadata/debug defaults merge with operation
options, and the resolver registry stays operation-local.

### Shared limitations

- Only Preview tokens (including suppliers), HTTP `preview.host` → `preview.environment`
  → Preview default, WebSocket `sessionHost`, and `resourceResolution` are mapped.
  Tokenless auth and other transport options are unsupported; ordinary transports are unaffected.
- Session locale, parameters, and extensions are server-owned. Snapshot HTTP supplies
  neither cancellation nor raw payloads; owners discard stale results and adopt plans.
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

| Package surface                                                                | Integration cost                                                                                                                                                                                               | Trade-off for consideration                                                                                             |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| String credentials/endpoints; no injected transport or client reconfiguration  | [Runtime](./src/live-preview.ts) evaluates SDK suppliers; [Web](../web/src/web-preview.ts) replaces the client for session/token changes.                                                                      | Supplier or transport support could reduce adaptation, with more authentication and lifecycle semantics in the package. |
| Snapshots return plans; subscriptions and `initialPayload` use raw payloads    | [Web's binding](../web/src/contentful-experiences.ts) resolves streamed payloads separately. Snapshot results cannot directly seed the client's existing payload support.                                      | Optional raw snapshot access could align these paths while retaining convenient resolved snapshots.                     |
| Snapshot helper has no `AbortSignal`                                           | [Node](../node/src/contentful-experiences.ts) and [Web](../web/src/contentful-experiences.ts) discard obsolete results; HTTP work continues.                                                                   | Cancellation support could stop wasted HTTP work; caller/resolver lifetime checks would still be necessary.             |
| Separate result/status subscriptions; retained payload with no clear operation | [WebPreview](../web/src/web-preview.ts) combines state and remembers the last client payload so status notifications cannot undo SDK reset.                                                                    | A combined result or clear operation could reduce this bookkeeping, with more package-owned state semantics.            |
| No shared snapshot/stream revision or initial-frame identity                   | Web uses a local payload sequence and cannot skip an equivalent first socket payload reliably.                                                                                                                 | Shared identity could avoid redundant initial work, but may require server/protocol changes as well as package changes. |
| Unbundled ESM distribution                                                     | The [Web](../../implementations/web-sdk/scripts/build-assets.ts) and [hybrid](../../implementations/node-sdk+web-sdk/scripts/build-assets.ts) references prepare browser assets; CJS hosts use dynamic import. | Additional distribution formats could reduce consumer setup at the cost of more package build/release maintenance.      |

Lazy opt-in, structural types, URL/Experience binding, event/profile suppression,
in-flight sharing, SSR serialization, rendering and caller cleanup remain SDK/app
responsibilities. The separate `sendPreviewStatus` call is an explicit integration
choice. Session-owned locale/parameters/extensions and unpublished protocol errors
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
XDA uses `Promise.all` across event chains while preserving result order; preparation runs
events sequentially. Destination validation precedes the final-type consent check.
Valid consent-blocked XDA events are omitted without cancelling content fetching;
hook/schema failures reject before transport. Prepared hook/schema failures or an
invalid/blocked final page produce the existing event-free fallback, while a later
preflight transport failure retains the evaluated replay. Retries and browser
prepared replay never rerun event hooks; browser replay still applies browser
consent and its metadata. Hooks preserve the existing transport boundaries, and
stateless free fetch functions gain no global registry. This final-type gate is a
local correction of the Optimization reference's original-type-only gate at `70dfa7f`.

## Shared handoff primitives

Runtime also exports `ExperiencesHandoff`, `createExperiencesHandoff`, `parseExperiencesHandoff`, `buildPreparedEvents`, `validatePreparedEvents`, cache-safety diagnostics, and `createRequestHandoffFromData`. Node uses these primitives for `prepareRequestHandoff()`, and Web validates the resulting handoff before state hydration or event admission.

The new handoff carries its Contentful space and environment, cache scope, optional evaluated profile, optional continuation ID, and optional prepared Personalization replay. `buildPreparedEvents` captures event IDs, timestamps, request context, locale, and current event-consent metadata once without sending; browser consent remains the permission gate. A prepared replay has identify/track events followed by exactly one final page, with SDK limits of 100 total events and 50 identify events. These are handoff limits, not asserted limits of the single-profile API endpoint. Server preparation reuses the validated batch when constructing the handoff and adding continuation identity. The exported create/parse operations validate each event batch once. The exported strict parser validates untrusted data, optional receiving-runtime scope, cache safety, and replay order. Browser `hydrateAndTrackCurrentPage` consumption validates the envelope first and defers prepared event validation to admission so rejection can fall back to ordinary current-page tracking. Parsing does not send events or alter SDK state.

Web's shared state-application helper also serves the public
`@contentful/experiences-web/bridge-support` entry. It applies profile state
through Web's state interceptors and atomically marks the request state successful,
including for profileless hydration; a profileless handoff leaves current profile
continuity unchanged. This helper does not run as part of an XDA content fetch.

Cache warnings are advisory; `assertExperiencesCacheSafety` and the create/parse operations reject a public or static handoff containing a profile, continuation ID, or replay. `public-permutation` requires a nonempty application-owned key covering Experience identity and content revision, environment, locale, and every dimension that changes rendered output. A profileless `static` handoff needs no key. Runtime does not set response headers or prove that application-rendered content is safe to cache.

Runtime's internal `createRequestHandoffFromData({ handoff, data? })` adds the
evaluated API profile to an existing private handoff and can preserve its replay.
Its existing shape and behavior remain unchanged. The distinct public Node free
function `createRequestHandoffFromData({ spaceId, environmentId, data?, cache? })`
constructs a state-only, private-request envelope through Runtime validation;
it emits no replay or top-level continuation ID. It accepts an ID-only profile,
omits `state` when no profile is supplied, and performs no events or network work.
Profileless hydration preserves existing browser state. Neither helper commits a
preflight result or copies selected-optimization data into the browser. No journal-specific 64 KiB cap or version field is applied to this envelope or to `PortableRenderPlan`; callers own safe serialization and response-size policy.

## XDA preflight and profile finalization

Event-bearing XDA always invokes the Personalization API (XPAPI) with
`preflight: true`; there is no override. It evaluates events and profile changes
without committing event or profile creation or mutation. A newly returned profile
ID is provisional. An existing concrete ID may remain concrete, but the previewed
changes remain uncommitted. Profile-only XDA invokes XPAPI GET internally, which
returns 404 for an uncommitted ID. The SDK-to-XDA request can still be POST;
that method does not describe the separate XDA-to-XPAPI hop.

Successful ordinary committing XPAPI `identify`, `page`, or `track`, or actual
browser replay, finalizes upstream state. Handoff state hydration, LocalStorage,
and cookies do not. Queue admission, `identityReady`, `flush()` resolution, and
generic SDK success are not proof of commit. Node and Web currently auto-adopt
XDA-returned IDs locally; this behavior does not finalize provisional IDs or
make them usable for a later profile-only fetch. The previously observed GET
failure for an XDA-created profile is explained by forced preflight, as confirmed
by the user. The observed `context.page.title` 422 is a separate, unresolved issue.

`prepareRequestHandoff()` also previews without committing. A strict hybrid flow
that previews on the server and submits on the client requires successful browser
commit/replay even for a single request; state-only hydration is insufficient.
Same-ID binding between preview and commit, and commit completion, are not
currently proved by the SDK handoff flow.

Multiple server Experience evaluations in that strict hybrid contract require
client reconciliation of multiple preview profile IDs/results, or server
finalization that breaks the server-preview/client-submit contract. This remains
true even with a future preflight toggle. Sequential fetching, a shared request
facade, or selecting one profile does not solve it. There is no shared preflight
transaction API to assume, and no architecture is selected here. Independent
profile-only reads using an already-concrete profile remain viable.

The current Node, Web, and hybrid references commit ordinary XPAPI events before
profile-only content fetching. Event-bearing XDA and preparation do not themselves
commit duplicate events; retry ambiguity remains for actual XPAPI commits. The
prepared-replay family is an Experiences capability, not a direct port of
Optimization at `59add9d6ebff503b9033a59a2eee0149d4b4e925`.

## Personalization delivery

`PersonalizationDelivery` shares one low-level Personalization transport with direct event methods. Ordinary online calls send directly and return response data; ordinary offline calls are accepted into an in-memory queue and may have no data yet. At capacity, an ordinary-only offline queue evicts its oldest event and admits the new event, following Optimization. A queue containing any prepared replay instead refuses overflow without evicting ordinary events or splitting prepared batches. Prepared batches are validated again and admitted whole at an event-count capacity of 100 by default. The prepared-batch limit stays at 100 even with a larger configured queue; a smaller queue or insufficient remaining capacity can reject an otherwise valid batch. Admission returns before HTTP settles. Prepared batches keep their event bodies, IDs, captured transport locale, and selected target identity through retry. Ordinary queued events keep their event bodies and use the current SDK request locale when sent; explicit event locales never select the transport locale. Direct online calls do not wait behind them. Concurrent `flush()` calls, including forced calls, join the active drain until that attempt settles. Completion does not guarantee delivery or wait for scheduled future retries; forcing bypasses connectivity/backoff/circuit gates but never starts a second concurrent drain. The retry policy follows Optimization's backoff and circuit defaults without a periodic Personalization timer. `reset()` invalidates queued work and late publications, including an active destroy drain; `destroy()` refuses new work, then makes one best-effort attempt to drain queued batches in order without publishing late state or scheduling retries. A failed request stops the drain. This is neither durable persistence nor an exactly-once guarantee. Runtime event methods enforce event consent and persistence policy at their owning leaves; consent is also included as event metadata where supported.

Owner bindings may supply fixed `getIsPreview` intent. Shared event methods check it before
building or profile lookup and return `{ accepted: false, reason: 'preview' }`; request/browser
state remains in the Node/Web leaves.

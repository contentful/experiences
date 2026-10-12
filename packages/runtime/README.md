# @contentful/experiences-runtime

> **Internal package.** The public Node and Web SDKs consume this shared runtime. Framework adapters re-export its `EventBuilder` API but do not construct the runtime.

Runtime owns the shared `ContentfulExperiences` base, the complete `EventBuilder` implementation and argument schemas, event metadata, runtime-only Delivery and Preview client construction, direct Optimization transport, event methods, and the current Node-to-Web handoff contract. Node binds request-local state; Web owns browser locale, context, and persisted profile state. Runtime itself does not retain those per-request or browser values.

The shared base and Node do not impose a singleton restriction. Multiple Node instances can coexist, and each `forRequest()` facade belongs to its creating instance. Web owns a `globalThis` lock allowing one live Experiences Web SDK per JavaScript runtime. Its `destroy()` stops browser-owned work before releasing that lock.

Client remains the lower-level Delivery and free-function boundary. Runtime imports `ContentfulViewDeliveryClient`, `fetchExperience`, host constants, and XDA-derived request types from `@contentful/experiences-client`. Client has no dependency on Runtime. Core remains dependency-free.

## Shared base

Construct `ContentfulExperiences` with a space, environment, Delivery configuration, and an `eventBuilder` configuration with an explicit platform `channel`. Preview and Optimization configuration are optional. The base creates and owns its Delivery, optional Preview, and Optimization clients. Fetch and resolve operations require `{ config: resolverConfig }` as a per-call resolve option, so one SDK can interpret different Experiences independently. Event-only construction and handoff preparation require no resolver registry. Metadata and debug defaults may still be configured on the SDK. By-ID `preview: true` requires a configured Preview client; destination operations remain delivery-only.

Delivery and Preview options accept a token or token supplier. A tokenless trusted proxy requires an explicit `host` and disables generated bearer authentication. Endpoint precedence is explicit `host`, then the generated client's `environment`, then the Delivery or Preview default. `environmentId` is the Contentful environment identifier used by by-ID requests, not the generated client's endpoint-valued `environment` option.

The base owns one `EventBuilder`, configured with a default library identity of `@contentful/experiences-runtime` when a leaf does not supply one. Node and Web supply their own library metadata. The builder's schemas, defaults, IDs, timestamps, context assembly, consent metadata, and event construction are colocated here. `identify`, `page`, and `track` use Personalization; view, click, hover, and flag-view events use Analytics. Node prepares one noncommitting request handoff batch. Web uses the Runtime-owned `PersonalizationDelivery` sender for ordinary online/offline events and imperative prepared-batch admission.

The generated Experience Delivery dependency is declared only by Client. Runtime directly declares its Optimization API client, `es-toolkit`, and `zod` dependencies. Its package metadata is injected into `sdk-info` during build and checked by `verify-release-artifact`.

See the [Node](../node/README.md), [Web](../web/README.md), and [root paired replay guide](../../README.md#paired-server-to-browser-replay) for the current public operations and handoff handling.

## Shared handoff primitives

Runtime also exports `ExperiencesHandoff`, `createExperiencesHandoff`, `parseExperiencesHandoff`, `buildPreparedEvents`, `validatePreparedEvents`, cache-safety diagnostics, and `createRequestHandoffFromData`. Node uses these primitives for `prepareRequestHandoff()`, and Web validates the resulting handoff before state hydration or event admission.

The new handoff carries its Contentful space and environment, cache scope, optional evaluated profile, optional continuation ID, and optional prepared Personalization replay. `buildPreparedEvents` captures event IDs, timestamps, request context, locale, and current GDPR metadata once without sending; `eventConsent` remains metadata, not a permission gate. A prepared replay has identify/track events followed by exactly one final page, with SDK limits of 100 total events and 50 identify events. These are handoff limits, not asserted limits of the single-profile API endpoint. The parser validates untrusted data, optional receiving-runtime scope, cache safety, and replay order before a browser can use it. It does not send events or alter SDK state.

Cache warnings are advisory; `assertExperiencesCacheSafety` and the create/parse operations reject a public or static handoff containing a profile, continuation ID, or replay. `public-permutation` requires a nonempty application-owned key covering Experience identity and content revision, environment, locale, and every dimension that changes rendered output. A profileless `static` handoff needs no key. Runtime does not set response headers or prove that application-rendered content is safe to cache.

`createRequestHandoffFromData` adds only the evaluated API profile to a private handoff. It does not commit a preflight result or copy selected-optimization data into the browser. No journal-specific 64 KiB cap or version field is applied to this envelope or to `PortableRenderPlan`; callers own safe serialization and response-size policy.

The generated XDA request currently has no preflight option. Ordinary by-ID
Experience fetches still pass profile IDs and events through Client's Delivery
boundary, using its event-bearing POST when supplied. Runtime exposes no
XDA-backed noncommitting content-preparation stub or duplicate-event
workaround. Once XDA and the generated client support preflight, map the real
request field through Client before adding a content-and-handoff operation.

## Personalization delivery

`PersonalizationDelivery` shares one low-level Personalization transport with direct event methods. Ordinary online calls send directly and return response data; ordinary offline calls are accepted into an in-memory queue and may have no data yet. At capacity, a new offline ordinary event is refused rather than evicting accepted work. Prepared batches are validated again and admitted whole at an event-count capacity of 100 by default. Admission returns before HTTP settles. Queued batches keep their event bodies, IDs, captured locale, and selected target identity through retry; direct online calls do not wait behind them. The retry policy follows Optimization's backoff and circuit defaults without a periodic Personalization timer. `reset()` invalidates queued work and late publications, including an active destroy drain; `destroy()` refuses new work, then makes one best-effort attempt to drain queued batches in order without publishing late state or scheduling retries. A failed request stops the drain. This is neither durable persistence nor an exactly-once guarantee. Consent remains GDPR event metadata only; permission and persistence policy are deferred to another workstream.

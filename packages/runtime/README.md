# @contentful/experiences-runtime

> **Internal package.** The public Node and Web SDKs consume this shared runtime. Framework adapters re-export its `EventBuilder` API but do not construct the runtime.

Runtime owns the shared `ContentfulExperiences` base, the complete `EventBuilder` implementation and argument schemas, event metadata, runtime-only Delivery and Preview client construction, direct Optimization transport, event methods, and the current Node-to-Web handoff contract. Node binds request-local state; Web owns browser locale, context, and persisted profile state. Runtime itself does not retain those per-request or browser values.

The shared base enforces one live Experiences SDK instance per JavaScript runtime through a `globalThis` owner lock. Direct base, Node, and Web constructors contend for that lock. `destroy()` releases ownership so a later SDK can be constructed; Node's multiple `forRequest()` facades belong to its one SDK instance. Web stops its active interaction observers before releasing ownership. Other replay and queue cleanup will be added with their owning runtime behavior.

Client remains the lower-level Delivery and free-function boundary. Runtime imports `ContentfulViewDeliveryClient`, `fetchExperience`, host constants, and XDA-derived request types from `@contentful/experiences-client`. Client has no dependency on Runtime. Core remains dependency-free.

## Shared base

Construct `ContentfulExperiences` with a space, environment, resolver configuration, Delivery configuration, and an `eventBuilder` configuration with an explicit platform `channel`. Preview and Optimization configuration are optional. The base creates and owns its Delivery, optional Preview, and Optimization clients, merges resolve defaults with per-call settings, and exposes resolve, by-ID fetch, and destination fetch operations. By-ID `preview: true` requires a configured Preview client; destination operations remain delivery-only.

Delivery and Preview options accept a token or token supplier. A tokenless trusted proxy requires an explicit `host` and disables generated bearer authentication. Endpoint precedence is explicit `host`, then the generated client's `environment`, then the Delivery or Preview default. `environmentId` is the Contentful environment identifier used by by-ID requests, not the generated client's endpoint-valued `environment` option.

The base owns one `EventBuilder`, configured with a default library identity of `@contentful/experiences-runtime` when a leaf does not supply one. Node and Web supply their own library metadata. The builder's schemas, defaults, IDs, timestamps, context assembly, consent metadata, and event construction are colocated here. Direct event methods use Personalization for `identify`, `page`, and `track`, and Analytics for view, click, hover, and flag-view events. The Node leaf can stage a one-shot handoff journal for paired browser replay; this extraction does not change its behavior.

The generated Experience Delivery dependency is declared only by Client. Runtime directly declares its Optimization API client, `es-toolkit`, and `zod` dependencies. Its package metadata is injected into `sdk-info` during build and checked by `verify-release-artifact`.

See the [Node](../node/README.md), [Web](../web/README.md), and [root paired replay guide](../../README.md#paired-server-to-browser-replay) for the current public operations and handoff handling.

## Shared handoff primitives

Runtime also exports `ExperiencesHandoff`, `createExperiencesHandoff`, `parseExperiencesHandoff`, `buildPreparedEvents`, `validatePreparedEvents`, cache-safety diagnostics, and `createRequestHandoffFromData`. These are shared building blocks for the new request/browser handoff contract; the Node and Web SDKs still use their existing event journal until their replacement methods are implemented.

The new handoff carries its Contentful space and environment, cache scope, optional evaluated profile, optional continuation ID, and optional prepared Personalization replay. `buildPreparedEvents` captures event IDs, timestamps, request context, locale, and current GDPR metadata once without sending; `eventConsent` remains metadata, not a permission gate. A prepared replay has identify/track events followed by exactly one final page, with at most 200 events and 50 identify events. The parser validates untrusted data, optional receiving-runtime scope, cache safety, and replay order before a browser can use it. It does not send events or alter SDK state.

Cache warnings are advisory; `assertExperiencesCacheSafety` and the create/parse operations reject a public or static handoff containing a profile, continuation ID, or replay. `public-permutation` requires a nonempty application-owned key covering Experience identity and content revision, environment, locale, and every dimension that changes rendered output. A profileless `static` handoff needs no key. Runtime does not set response headers or prove that application-rendered content is safe to cache.

`createRequestHandoffFromData` adds only the evaluated API profile to a private handoff. It does not commit a preflight result or copy selected-optimization data into the browser. The old journal's 64 KiB cap and version field are not applied to this new envelope or to `PortableRenderPlan`; callers own safe serialization and response-size policy.

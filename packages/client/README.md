# @contentful/experiences-client

> **Internal package.** Published to npm so framework adapters can resolve it at install time, but you're not meant to import it directly. It comes in transitively via the framework adapter (`@contentful/experiences-react`, `@contentful/experiences-svelte`, etc.).

Isolates `@contentful/experience-delivery` — the generated Experience Delivery client — and owns the free fetch functions, payload conversion, delivery errors, and XDA-derived request types. The shared runtime and complete `EventBuilder` live in `@contentful/experiences-runtime`, which depends on this package. Client accepts only raw built XDA events; it does not build events or depend on Runtime. Runtime-backed fetch accepts the existing type-tagged builder arguments and builds them before calling Client. The existing free functions remain supported for adapter and application integration.

---

## What's in here

### `fetchExperience(experienceOptions, clientOptions, resolveOptions)`

The primary fetch + resolve entry point. Fetches an Experience payload and resolves it into a `PortableRenderPlan` in one call. Its internal `fetchExperiencePayload` loader shares the same exclusive selector union and returns a payload or redirect before resolution, so runtime consumers do not fetch the selected Experience a second time. There are three ways to say which Experience:

- **By destination path** (recommended for apps): `{ spaceId, destinationId, path }`. The URL path is the Destination path.
- **By destination node id**: `{ spaceId, destinationId, nodeId }`.
- **By Experience id**: `{ spaceId, environmentId, experienceId, … }`. Use it when you already hold an id.

The destination forms are space-scoped (no `environmentId`, `parameters` or `extensions`) and accept `locale` and `personalization`; supplying personalization sends a POST instead of the cacheable GET. Locale is forwarded as a query value on GET and POST. Defined `parameters` or `extensions` on a destination selector reject with `TypeError` before transport, including empty objects; `undefined` is treated as absent. They return `PortableRenderPlan | DestinationRedirectResult`: a redirect node resolves to `{ redirect: { path } }`, which you follow instead of rendering.

When migrating shared fetch defaults, remove `parameters` and `extensions` from
destination descriptors, including defaults such as `{}`. Supply these options
only with `experienceId`; explicit `undefined` remains absent.

```ts
const result = await fetchExperience(
  { spaceId, destinationId, path: '/demo/landing' },
  { accessToken: process.env.CDA_TOKEN! },
  { config: experienceConfig }
);
if ('redirect' in result) return redirect(result.redirect.path);
// result is a PortableRenderPlan
```

Free fetch functions use ordinary Delivery. Preview Session fetching belongs to the Node/Web runtime owners or the low-level Preview Session helpers; there is no per-call preview toggle.

By-ID options accept a first-class `personalization` object containing a profile id and events. Additional Experience Delivery options remain under `extensions`; use `extensions: { sourceMap: {} }` to request a content source map. Client merges both into the XDA request body and uses the POST operation whenever either capability is present.

`PersonalizationOptions` intersects the installed dev.13 generated request type
with Optimization's event types. Client validates events directly with the
Identify, PageView, ScreenView, Track and View schemas from
`@contentful/optimization-api-client/api-schemas`. Their canonical parsing rules
apply, including the `en-US` locale default and omission of undeclared fields
except schema catchalls, without mutating input. Supported channels are `mobile`, `server` and `web`.
Events require campaign context and original/sent timestamps; page properties
require a title, Track properties and Identify traits are required, and country
codes must contain two characters. XDA does not support Optimization's
`exo_node_view` event or null property/trait values; Client rejects those before
transport. Screen events require `name` and `context.screen`; screen properties
are optional. `context.gdpr.isConsentGiven` is boolean, optional
`context.page.title` is a string, and page query values accept `string | string[]`.
Invalid input throws `TypeError` before Delivery is called.

Node/Web separately stamp admitted events with owner consent before interception,
preserving caller input and allowing explicit interceptor transforms. They validate
transformed events after interception and before final consent callbacks or Web
event publication; malformed transformed fields reject before transport.

The generated dev.13 request supports optional `personalization.preflight`.
Client validates the boolean and defaults supplied personalization to `false`
for by-ID and both destination fetch forms; explicit booleans win. It adds no
personalization when none was supplied. Under the upstream contract, `false`
commits events and profile changes, while `true` evaluates without commitment;
XDA itself defaults an omitted value to `true`. A preview-generated ID can be reused
by a Personalization API POST carrying events through XDA or a direct call.
Profile-only XDA uses Personalization API GET internally even when SDK-to-XDA
uses POST, and can fail for an uncommitted ID. Local adoption does not prove
finalization; live-service verification remains a release requirement.
See [XDA preflight and profile finalization](../runtime/README.md#xda-preflight-and-profile-finalization)
for finalization requirements and the subsequent GET limitation. Node's
`fetchExperienceForHandoff` producer is retained only for an actual server-to-browser
transfer, with `{ routeKey }` as its third argument. It retains finalized replay
for optional explicit browser consumption; ordinary SSR/CSR uses ordinary fetch
and relies on verified upstream commitment behavior. Handoff is never content
Retry input. Both ordinary XDA fetches and the transfer producer use canonical
Client parsing, including supported query arrays. Client owns no consent, construction or replay decision.

By-ID `parameters` accepts strings, numbers, and one-level Records of strings/numbers:
`{ featuredPosts: { limit: 6, order: '-fields.title' } }`. IDs are declared in
`Experience.parameters` and referenced by `$parameters/<id>`. Delivery validates
names, requiredness, fallbacks and values. Collection order is one signed
`fields.<apiName>` or `sys.<id>` path, never `OrderTerm[]`.

GET uses `parameter.<id>` and `parameter.<id>.<field>` in the generated client's
`queryParams`, separate from `locale`. Empty Records or defined extensions select
POST, with structured, unprefixed `parameters` in the body supported by the
generated client. Authentication and rename headers
remain owned by the generated client. Refetch with changed values and replace
the renderer's plan; see the [runtime parameters example](../../README.md#runtime-experience-parameters).

Three positional args group by concern:

| Arg                 | Type                                                                                                                                                                           | Purpose                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `experienceOptions` | `{ spaceId, destinationId, path \| nodeId, locale?, personalization? }` **or** `{ spaceId, environmentId, experienceId, locale?, parameters?, personalization?, extensions? }` | Which Experience to fetch: by destination or by id.                               |
| `clientOptions`     | `{ accessToken, host? }` **or** `{ client }`                                                                                                                                   | How to fetch — inline Delivery credentials or a pre-made client.                  |
| `resolveOptions`    | `{ config, metadata?, debug? }`                                                                                                                                                | How to resolve — component registry, per-render `metadata`, and a `debug` switch. |

```ts
import { fetchExperience } from '@contentful/experiences-react'; // or experiences-svelte

// Inline credentials — client created internally
const plan = await fetchExperience(
  { spaceId: '...', environmentId: 'master', experienceId: slug, locale: 'en-US' },
  {
    accessToken: process.env.CDA_TOKEN!,
  },
  {
    config: experienceConfig,
    metadata: { slug }, // flows into resolveData hooks as ctx.experience.metadata
    debug: false, // logs + visible missing-component box when true
  }
);

// Pre-created client — useful when you manage the client lifecycle yourself.
// The generated client binds spaceId/environmentId at construction, so a
// pre-made client can only serve the by-id/environment it was built with.
import { createClient } from '@contentful/experiences-react';
const client = createClient({ accessToken: process.env.CDA_TOKEN!, spaceId, environmentId });
const plan = await fetchExperience(
  { spaceId, environmentId, experienceId },
  { client },
  { config: experienceConfig }
);
```

Returns `PortableRenderPlan`. An empty-nodes payload (draft / unpublished / empty locale) resolves to a valid plan with `nodes: []` — it is not a 404. For the missing-experience case, catch `NotFoundError` (re-exported below).

Malformed selectors reject with `TypeError` before Delivery: supply either a
nonempty `experienceId`, or a nonempty `destinationId` with exactly one nonempty
`path` or `nodeId`. Paths must start with `/`. Selector values are validated
without trimming or normalization; content existence remains a Delivery concern.

Successful responses can carry upstream field-resolution errors alongside useful
content. Core projects recognized errors into optional `plan.deliveryDiagnostics`
records with string `fieldPath` and `message`, preserving order and omitting
`originalError` and unknown fields. Client retains the payload errors through
by-ID GET/POST and destination conversion; generated-schema compatibility remains
Client-owned, with a single normalization point in Core.

Destination errors may have broader shapes, so this projection does not promise
complete coverage. An absent field does not prove personalization success or the
absence of other upstream errors. Existing `diagnostics: Error[]`, exceptions,
404 handling, and profile behavior are unchanged. See the [delivery diagnostic
guidance](../../README.md#delivery-diagnostics) for safe presentation and disclosure.

#### Preview Sessions

Configure optional `preview` capability on the Node/Web owner once. A nonempty,
trimmed `preview_session_id` in the browser URL activates preview; server
integrations read the incoming request URL and pass request-local
`preview: { sessionId }` to Node's `forRequest()`. Without both configuration and
an ID, the owner uses ordinary Delivery. See the [Runtime preview contract](../runtime/README.md#optional-runtime-live-preview).
The separate low-level Preview Session helpers retain their `previewToken` API.

### `createClient(options)`

Functional constructor over `ContentfulViewDeliveryClient` matching the SDK's option shape. Maps `accessToken → token` and `host → baseUrl`; passes everything else through unchanged. Prefer over `new ContentfulViewDeliveryClient({...})` so field names stay consistent with `fetchExperience`'s inline-credentials path.

`createClient` is a one-time setup primitive — it builds a single client bound to a single token, space, and environment, for ordinary Delivery. `spaceId`/`environmentId` are required — `@contentful/experience-delivery` binds them at client construction as of `1.0.0-dev.13`, so a client built here can only serve requests for that space/environment.

```ts
import { createClient } from '@contentful/experiences-react';

// Delivery (default)
const client = createClient({ accessToken: process.env.CDA_TOKEN!, spaceId, environmentId });

// Custom base URL (staging, proxy, per-region)
const customClient = createClient({
  accessToken: process.env.CDA_TOKEN!,
  spaceId,
  environmentId,
  host: 'https://preview-staging.example.com',
  // headers, timeoutInSeconds, maxRetries, fetch, logging pass through
});
```

#### `DELIVERY_HOST` / `PREVIEW_HOST` / `PREVIEW_WEBSOCKET_HOST`

Named constants for the canonical delivery, preview, and Preview Session WebSocket URLs. Use them so you don't have to hardcode the URL strings in your app.

```ts
import { DELIVERY_HOST, PREVIEW_HOST, PREVIEW_WEBSOCKET_HOST } from '@contentful/experiences-react';

DELIVERY_HOST; // 'https://xdn.contentful.com'
PREVIEW_HOST; // 'https://preview.xdn.contentful.com'
PREVIEW_WEBSOCKET_HOST; // 'wss://preview.xdn.contentful.com'
```

`createClient` binds one token and host. Custom hosts and caller-supplied clients
remain available; neither selects Preview Session policy or replaces its runtime owner.

### `fetchDestinationSitemap(destinationOptions, clientOptions, paginationOptions?)`

Lists every routable path in a published Destination, for static generation, `sitemap.xml`, or any other bulk walk. It does not hydrate Experiences; feed each `path` to `fetchExperience`.

```ts
import { fetchDestinationSitemap } from '@contentful/experiences-react';

const paths: string[] = [];
let pageNext: string | undefined;
do {
  const sitemap = await fetchDestinationSitemap(
    { spaceId, destinationId },
    { accessToken: process.env.CDA_TOKEN! },
    { pageNext } // limit defaults to 100, max 1000
  );
  paths.push(...sitemap.items.map((item) => item.path));
  pageNext = sitemap.pages.next;
} while (pageNext);
```

Each item is `{ path, experienceId, type }`. Cursors (`pages.next`, `pages.prev`) are opaque; don't combine `pageNext` and `pagePrev`. A missing Destination throws `NotFoundError`. Node and Web instances also expose `sdk.fetchDestinationSitemap({ destinationId }, pagination)` through their configured Delivery client.

### `NotFoundError`

Re-exported from `@contentful/experience-delivery` as a value + type. Thrown by the underlying delivery client on 404 responses. Use `isNotFoundError(error)` to recognize that class or a numeric `statusCode: 404` across package/serialization boundaries, then route it to your framework's 404 idiom. The predicate does not inspect error names, messages or nested causes:

```ts
import { fetchExperience, isNotFoundError } from '@contentful/experiences-react';

try {
  const experience = await fetchExperience(/* … */);
  // …
} catch (err) {
  if (isNotFoundError(err)) notFound(); // Next.js
  throw err;
}
```

The full delivery-client error namespace is also re-exported as `ContentfulViewDelivery` (`UnauthorizedError`, `ForbiddenError`, `ConflictError`, `UnprocessableEntityError`, `InternalServerError`, `ContentfulViewDeliveryError`, `ContentfulViewDeliveryTimeoutError`).

### `isPreviewSessionFetchError(error)`

Recognizes Runtime-owned Preview Session acquisition failures, including HTTP 404,
without installing the optional Live Preview package. These failures retain their
original `cause` and are distinct from missing Delivery content. See the
[Runtime Preview contract](../runtime/README.md#optional-runtime-live-preview).

### `ContentfulViewDeliveryClient`

Re-exported directly from `@contentful/experience-delivery`. Exposed for advanced use cases where you want full control over the client (custom base URL, request options, reuse across calls). Most consumers should prefer `createClient` (above).

```ts
import { ContentfulViewDeliveryClient } from '@contentful/experiences-react';

const client = new ContentfulViewDeliveryClient({
  token: process.env.CDA_TOKEN!,
  spaceId,
  environmentId,
  baseUrl: 'https://xdn.contentful.com', // default delivery endpoint
});
```

---

## Why a separate package?

`@contentful/experiences-sdk-core` is intentionally zero-dep and runtime-neutral — it must stay importable without pulling in any network or platform code. The experience delivery client is large (~3,000 generated files) and only needed when doing server-side fetching. Isolating it here means:

- Core stays lean and usable in any environment (edge, SSR, test fixtures).
- Future adapters that render from local fixtures or a custom fetch path don't pay the delivery client's weight.
- The delivery client version can be bumped in one place.

---

## Package conventions

- Do not import `@contentful/experience-delivery` from anywhere except this package.
- Re-export only what framework adapters need to surface to their users.
- Keep `fetchExperience` thin — fetch + cast + resolve. Business logic belongs in `packages/core`.
- Validate events directly with `@contentful/optimization-api-client/api-schemas`, preserving canonical defaults and unknown-field stripping except schema catchalls. Keep the generated request/event type intersection and XDA exclusions for `exo_node_view` and null property/trait values. Keep the direct Optimization API client and `zod` dependencies; do not import Runtime or `EventBuilder` into Client.
- Name mappings between SDK options and delivery-client options live in `create-delivery-client.ts` — one place to change.

## License

MIT. See the repository [`LICENSE`](../../LICENSE) and [`NOTICE`](../../NOTICE) for full attribution.

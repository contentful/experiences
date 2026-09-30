# @contentful/experiences-client

> **Internal package.** Published to npm so framework adapters can resolve it at install time, but you're not meant to import it directly. It comes in transitively via the framework adapter (`@contentful/experiences-react`, `@contentful/experiences-svelte`, etc.).

Isolates `@contentful/experience-delivery` — the generated experience delivery client — so that `@contentful/experiences-sdk-core` stays dependency-free and framework adapters that don't need network access don't pull it in transitively. It also owns the lower-layer shared `ContentfulExperiences` runtime for the public Node and Web SDKs and event construction.

`ContentfulExperiences` is intentionally not re-exported by framework adapters
and is not a new application-facing adapter API. The existing free functions
remain supported for adapter and application integration.

---

## What's in here

### Shared lower-layer runtime

`ContentfulExperiences` is an internal shared runtime contract for the public
Node/Web SDKs. Construct it with a space, environment, resolver configuration,
a delivery configuration, and an `eventBuilder` config with an explicit
`channel`; optionally provide a preview configuration. It constructs and retains
those clients, merges configured resolve defaults with per-call options, and
exposes `resolveExperience` and by-id/destination `fetchExperience` methods.
Calling `fetchExperience` with `preview: true` requires preview configuration.

The runtime-owned Delivery and Preview clients support two security models. For
direct API access, provide an `accessToken`; it may be a supplier and is sent to
the selected endpoint. For a trusted application proxy that adds the upstream
token itself, omit `accessToken` and provide an explicit `host`; the runtime
disables generated bearer authentication. `environmentId` is the Contentful
environment identifier passed to by-ID requests, not the generated delivery
client's optional endpoint-valued `environment`. Endpoint precedence is
explicit `host`, then generated-client `environment`, then the delivery or
preview default.

Direct browser tokens are credentials but are intentionally browser-visible
when an application's scope and CORS policy permit that model. Proxy mode keeps
the upstream token server-side. In either mode, treat custom endpoints as
trusted configuration.

The optional preview client enables direct CPA fetches by Experience ID through
the same shared runtime. It is separate from `@contentful/experiences-live-preview`,
which owns Preview Session HTTP loading, WebSocket subscription, and update state.
Destination operations continue to use the delivery client.

The runtime constructs and owns one `EventBuilder` and one Optimization API
client. The caller supplies the event channel, while the runtime retains this
SDK's default library identity and the runtime locale unless overridden. This
package owns event construction and direct transport for the lower layer,
rather than Core. It exposes a protected binding point used by the public Node
and Web leaves; Client itself does not retain a mutable event profile.

By default the Optimization client uses the runtime's `spaceId` and maps its
Contentful `environmentId` to the Optimization client's `environment` option.
This is the same Contentful environment identifier passed to by-ID delivery
requests, not the generated delivery client's endpoint-valued `environment`
setting. The optional `optimization` configuration can provide API-specific
endpoint, feature, and fetch overrides; the runtime always constructs and owns
the Optimization client. Custom Optimization base URLs receive complete event
and profile payloads, so treat them as sensitive-data destinations and use only
trusted HTTPS origins outside explicit local development.

The bound event methods normally send immediately: `identify`, `page`, and
`track` upsert a profile through the Personalization API; view, click, hover,
and flag-view events send a one-event batch through Analytics. Queues, durable
profile persistence, consent gating, lifecycle/beacon delivery, automatic
interaction tracking, and Live Preview integration are intentionally absent.
The Node leaf additionally has a request-scoped, one-shot handoff journal for
paired browser replay; it is not an SDK queue or persistence mechanism. Because
calls are not serialized, callers must await profile-producing calls before
starting another profile-producing or Analytics call on the same bound runtime.

### Server-to-browser event handoff contract

`RuntimeEventHandoff` is the internal replay payload between Node and Web. Node
alone chooses direct `commit` or paired-browser `handoff` delivery per request.
The handoff holds a version, Contentful scope, optional initial profile, ordered
Personalization/Analytics event bodies, and an optional initial-page route key. Its
internal serialized-payload cap is 64 KiB. Node can preflight the initial
Personalization sequence as one batch; individual Personalization methods remain
cumulative and Analytics methods stage without transport. Web validates the
payload, admits page-bearing journals only for a matching browser route,
batches compatible adjacent Personalization entries, preserves locale and Analytics
ordering boundaries, and chains each resulting profile.

The payload is browser-visible sensitive data. Application integration must use
escaped serialization in a private, no-store response and exclude secrets and
server-only traits. Do not cache, log, or persist it. Replay may partially
commit, has no automatic retry or distributed exactly-once guarantee, and is
independent from Live Preview. A failed replay rejects its receipt but releases
later direct Web calls. See the root [paired replay guide](../../README.md#paired-server-to-browser-replay).

This package's direct dependencies are the generated delivery client,
`@contentful/optimization-api-client` (event schemas, logger, and transport), `es-toolkit`
(event-property merging), and `zod` (event argument schemas), in addition to
Core. None of those dependencies are introduced into Core.

### `fetchExperience(experienceOptions, clientOptions, resolveOptions)`

The primary fetch + resolve entry point. Fetches an Experience payload from the Experience Delivery API and resolves it into a `PortableRenderPlan` in one call.

By-ID options accept a first-class `personalization` object containing a profile id and events. Additional Experience Delivery options remain under `extensions`; use `extensions: { sourceMap: {} }` to request a content source map. Client merges both into the XDA request body and uses the POST operation whenever either capability is present.

Three positional args group by concern:

| Arg                 | Type                                                                  | Purpose                                                                                |
| ------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `experienceOptions` | `{ spaceId, environmentId, experienceId, locale? }`                   | Which Experience to fetch.                                                             |
| `clientOptions`     | `{ accessToken, previewToken?, preview?, host? }` **or** `{ client }` | How to fetch — inline credentials (with optional preview toggle) or a pre-made client. |
| `resolveOptions`    | `{ config, metadata?, debug? }`                                       | How to resolve — component registry, per-render `metadata`, and a `debug` switch.      |

```ts
import { fetchExperience } from '@contentful/experiences-react'; // or experiences-svelte

// Inline credentials — client created internally
const plan = await fetchExperience(
  { spaceId: '...', environmentId: 'master', experienceId: slug, locale: 'en-US' },
  {
    accessToken: process.env.CDA_TOKEN!,
    previewToken: process.env.PREVIEW_TOKEN!, // optional — only required when preview: true
    preview: false, // flip to true for preview mode; picks previewToken + preview host
  },
  {
    config: experienceConfig,
    metadata: { slug }, // flows into resolveData hooks as ctx.experience.metadata
    debug: false, // logs + visible missing-component box when true
  }
);

// Pre-created client — useful when you manage the client lifecycle yourself
import { createClient } from '@contentful/experiences-react';
const client = createClient({ accessToken: process.env.CDA_TOKEN! });
const plan = await fetchExperience(
  { spaceId, environmentId, experienceId },
  { client },
  { config: experienceConfig }
);
```

Returns `PortableRenderPlan`. An empty-nodes payload (draft / unpublished / empty locale) resolves to a valid plan with `nodes: []` — it is not a 404. For the missing-experience case, catch `NotFoundError` (re-exported below).

#### Preview mode

Configure both tokens up front and flip `preview: true` per call to hit the preview API.

```ts
const experience = await fetchExperience(
  { spaceId, environmentId, experienceId },
  {
    accessToken: process.env.CDA_TOKEN!,
    previewToken: process.env.PREVIEW_TOKEN!,
    preview: previewMode, // boolean — flip per request
  },
  { config: experienceConfig }
);
```

- `preview: false` (or unset) → uses `accessToken` against the delivery host.
- `preview: true` → uses `previewToken` against the preview host. Throws `fetchExperience() called with preview: true but no previewToken was provided` if `previewToken` is missing.
- `host` is only for custom base URLs (staging, proxy, per-region). When set, it wins over the `preview`-derived host — so `{ previewToken, preview: true, host: 'https://preview-staging…' }` uses the preview token against your custom URL.
- With the `{ client }` option, `preview` is ignored (bring your own client, bring your own token/host choice).

### `createClient(options)`

Functional constructor over `ContentfulViewDeliveryClient` matching the SDK's option shape. Maps `accessToken → token` and `host → baseUrl`; passes everything else through unchanged. Prefer over `new ContentfulViewDeliveryClient({...})` so field names stay consistent with `fetchExperience`'s inline-credentials path.

`createClient` is a one-time setup primitive — it builds a single client bound to a single token and does not participate in the per-request `preview` toggle. If you need runtime-dynamic swaps between delivery and preview, use `fetchExperience`'s inline-credentials path (`{ accessToken, previewToken, preview }`) instead of pre-building a client via `createClient` and passing `{ client }`.

```ts
import { createClient, PREVIEW_HOST } from '@contentful/experiences-react';

// Delivery (default)
const client = createClient({ accessToken: process.env.CDA_TOKEN! });

// Preview — use PREVIEW_HOST + a CPA token
const previewClient = createClient({
  accessToken: process.env.PREVIEW_TOKEN!,
  host: PREVIEW_HOST,
});

// Custom base URL (staging, proxy, per-region)
const customClient = createClient({
  accessToken: process.env.CDA_TOKEN!,
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

`createClient` is the fixed-mode path — one client, one token, one host. If you need to flip between delivery and preview per request (e.g. an `isPreview` URL param), use `fetchExperience`'s inline-credentials form with `preview: boolean` instead of pre-building a client here. See ["Preview mode"](#preview-mode) above.

### `NotFoundError`

Re-exported from `@contentful/experience-delivery` as a value + type. Thrown by the underlying delivery client on 404 responses. Route it to your framework's 404 idiom:

```ts
import { fetchExperience, NotFoundError } from '@contentful/experiences-react';

try {
  const experience = await fetchExperience(/* … */);
  // …
} catch (err) {
  if (err instanceof NotFoundError) notFound(); // Next.js
  throw err;
}
```

The full delivery-client error namespace is also re-exported as `ContentfulViewDelivery` (`UnauthorizedError`, `ForbiddenError`, `ConflictError`, `UnprocessableEntityError`, `InternalServerError`, `ContentfulViewDeliveryError`, `ContentfulViewDeliveryTimeoutError`).

### `ContentfulViewDeliveryClient`

Re-exported directly from `@contentful/experience-delivery`. Exposed for advanced use cases where you want full control over the client (custom base URL, request options, reuse across calls). Most consumers should prefer `createClient` (above).

```ts
import { ContentfulViewDeliveryClient } from '@contentful/experiences-react';

const client = new ContentfulViewDeliveryClient({
  token: process.env.CDA_TOKEN!,
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
- Name mappings between SDK options and delivery-client options live in `create-delivery-client.ts` — one place to change.

## License

MIT. See the repository [`LICENSE`](../../LICENSE) and [`NOTICE`](../../NOTICE) for full attribution.

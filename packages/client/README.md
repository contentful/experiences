# @contentful/experiences-client

> **Internal package.** Published to npm so framework adapters can resolve it at install time, but you're not meant to import it directly. It comes in transitively via the framework adapter (`@contentful/experiences-react`, `@contentful/experiences-svelte`, etc.).

Isolates `@contentful/experience-delivery` — the generated experience delivery client — so that `@contentful/experiences-sdk-core` stays zero-dep and framework adapters that don't need network access don't pull it in transitively.

---

## What's in here

### `fetchExperience(experienceOptions, clientOptions, resolveOptions)`

The primary fetch + resolve entry point. Fetches an Experience payload from the Experience Delivery API and resolves it into a `PortableRenderPlan` in one call.

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

#### `DELIVERY_HOST` / `PREVIEW_HOST`

Named constants for the canonical XDA delivery and preview URLs. Use them so you don't have to hardcode the URL strings in your app.

```ts
import { DELIVERY_HOST, PREVIEW_HOST } from '@contentful/experiences-react';

DELIVERY_HOST; // 'https://xdn.contentful.com'
PREVIEW_HOST; // 'https://preview.xdn.contentful.com'
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
- Name mappings between SDK options and delivery-client options live in `create-client.ts` — one place to change.

## License

MIT. See the repository [`LICENSE`](../../LICENSE) and [`NOTICE`](../../NOTICE) for full attribution.

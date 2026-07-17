# @contentful/experiences-client

> **Internal package.** Published to npm so framework adapters can resolve it at install time, but not intended for direct customer import. Consumed transitively via the framework adapter (`@contentful/experiences-react`, `@contentful/experiences-svelte`, etc.).

Isolates `@contentful/experience-delivery` — the generated experience delivery client — so that `@contentful/experiences-core` stays zero-dep and framework adapters that don't need network access don't pull it in transitively.

---

## What's in here

### `fetchExperience(experienceOptions, clientOptions, resolveOptions)`

The primary fetch + resolve entry point. Fetches an Experience payload from the Experience Delivery API and resolves it into a `PortableRenderPlan` in one call.

Three positional args group by concern:

| Arg                 | Type                                                | Purpose                                           |
| ------------------- | --------------------------------------------------- | ------------------------------------------------- |
| `experienceOptions` | `{ spaceId, environmentId, experienceId, locale? }` | Which Experience to fetch.                        |
| `clientOptions`     | `{ accessToken, host? }` **or** `{ client }`        | How to fetch — inline creds or a pre-made client. |
| `resolveOptions`    | `{ config, context? }`                              | How to resolve — component registry + context.    |

```ts
import { fetchExperience } from '@contentful/experiences-react'; // or experiences-svelte

// Inline credentials — client created internally
const plan = await fetchExperience(
  { spaceId: '...', environmentId: 'master', experienceId: slug, locale: 'en-US' },
  {
    accessToken: process.env.CDA_TOKEN!,
    host: 'https://preview.xdn.contentful.com', // optional — omit for default endpoint
  },
  {
    config: experienceConfig,
    context: { isPreview: false, metadata: { slug } }, // flows into resolveData hooks
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

### `createClient(options)`

Functional constructor over `ContentfulViewDeliveryClient` matching the SDK's option shape. Maps `accessToken → token` and `host → baseUrl`; passes everything else through unchanged. Prefer over `new ContentfulViewDeliveryClient({...})` so field names stay consistent with `fetchExperience`'s inline-creds path.

```ts
import { createClient } from '@contentful/experiences-react';

const client = createClient({
  accessToken: process.env.CDA_TOKEN!,
  host: 'https://preview.xdn.contentful.com', // optional
  // headers, timeoutInSeconds, maxRetries, fetch, logging pass through
});
```

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

`@contentful/experiences-core` is intentionally zero-dep and runtime-neutral — it must stay importable without pulling in any network or platform code. The experience delivery client is large (~3,000 generated files) and only needed when doing server-side fetching. Isolating it here means:

- Core stays lean and usable in any environment (edge, SSR, test fixtures).
- Future adapters that render from local fixtures or a custom fetch path don't pay the delivery client's weight.
- The delivery client version can be bumped in one place.

---

## Package conventions

- Do not import `@contentful/experience-delivery` from anywhere except this package.
- Re-export only what framework adapters need to surface to customers.
- Keep `fetchExperience` thin — fetch + cast + resolve. Business logic belongs in `packages/core`.
- Name mappings between SDK options and delivery-client options live in `create-client.ts` — one place to change.

## License

MIT. See the repository [`LICENSE`](../../LICENSE) and [`NOTICE`](../../NOTICE) for full attribution.

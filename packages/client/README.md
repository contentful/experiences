# @contentful/experiences-client

> **Internal package.** Not published separately. Consumed via the framework adapter (`@contentful/experiences-react`, `@contentful/experiences-svelte`, etc.).

Isolates `@contentful/experience-delivery` — the generated experience delivery client — so that `@contentful/experiences-core` stays zero-dep and framework adapters that don't need network access don't pull it in transitively.

---

## What's in here

### `fetchExperience(options)`

The primary fetch + resolve entry point. Fetches an Experience payload from the Experience Delivery API and resolves it into a `PortableRenderPlan` in one call.

```ts
import { fetchExperience } from '@contentful/experiences-react'; // or experiences-svelte

// Inline credentials — client created internally
const plan = await fetchExperience({
  accessToken: process.env.CDA_TOKEN!,
  preview: false, // true → hits the preview API endpoint
  spaceId: '...',
  environmentId: 'master',
  experienceId: slug,
  config: experienceConfig,
  locale: 'en-US', // optional
  context: {
    // optional — flows into resolveData hooks as ctx.experience
    isPreview: false,
    metadata: { slug },
  },
});

// Pre-created client — useful when you manage the client lifecycle yourself
import { ContentfulViewDeliveryClient } from '@contentful/experiences-react';
const client = new ContentfulViewDeliveryClient({ token: process.env.CDA_TOKEN! });
const plan = await fetchExperience({ client, spaceId, environmentId, experienceId, config });
```

Returns `PortableRenderPlan | null`. Returns `null` when the fetched payload has no nodes.

### `ContentfulViewDeliveryClient`

Re-exported directly from `@contentful/experience-delivery`. Exposed for advanced use cases where you want full control over the client (custom base URL, request options, reuse across calls).

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

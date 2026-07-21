# examples/scripts

One-time setup scripts for the customer-facing example apps in [`../nextjs`](../nextjs) and [`../sveltekit`](../sveltekit). Not published; not part of the SDK; not something the running example apps depend on. This directory only exists to make the examples runnable from a clean checkout.

## bootstrap-example.ts

Seeds the demo Experience into a Contentful space + environment via the experiences management API. After it succeeds, the example apps can fetch and render the seeded Experience by id.

### Run it

```sh
cp .env.example .env
# Fill in:
#   SPACE_ID          — id of the space you're seeding into
#   ENVIRONMENT_ID    — id of the environment (usually `master`)
#   CMA_TOKEN         — Personal Access Token (CFPAT-...) with write access
#                       to that space. Create one at
#                       https://app.contentful.com/account/profile/cma_tokens
#                       from within the org that owns the space.

npm install               # from the repo root, if you haven't already
npm run bootstrap
```

The script prints the resulting experienceId at the end — paste it into the example app's `.env.local` (or hit `/landing` directly if you left the fixture unchanged).

### What it seeds

The demo is a minimal `landing` Experience — one hero + two cards — that exercises the ExO composition pattern end-to-end. It provisions:

| Step | Resource type | Count | Notes                                                                             |
| ---- | ------------- | ----- | --------------------------------------------------------------------------------- |
| 1    | ContentType   | 1     | `promotion` (title, teaser, body, ctaLabel, ctaUrl, image)                        |
| 2    | Asset         | 3     | hero background + 2 card images, read from `fixture/assets/` and uploaded to your space |
| 3    | Entry         | 3     | 3 `promotion` entries (hero + 2 cards)                                            |
| 4    | DesignToken   | 15    | color/size/fontSize/fontWeight tokens referenced by ComponentTypes                |
| 5    | ComponentType | 8     | Section, Heading, RichText, Text, Button, Image (primitives) + hero-plain + card  |
| 6    | Template      | 1     | `page` (passthrough)                                                              |
| 7    | DataAssembly  | 2     | `Hero from Promotion` + `Card from Promotion` (map entry fields to CT props)      |
| 8    | (linkage)     | 2     | Append DA links to hero-plain and card ComponentTypes, republish                  |
| 9    | Experience    | 1     | `landing` — hero + Section(card, card)                                            |

Each step is idempotent: if a resource with the fixture's id already exists, that step is skipped. Re-running against a half-seeded env picks up where a previous run left off.

### Fixture

The concrete data the script provisions lives in [`fixture/`](./fixture) — one TypeScript module per resource kind. If you want a different demo, edit those files rather than the bootstrap. `fixture/types.ts` documents each shape; every fixture module exports typed data the bootstrap imports directly.

### Known limitations

- **RichText body is currently omitted from the DataAssembly return mapping.** The DA validator rejects our `body { document: json }` GraphQL alias with "Field path `_node.body` not found." Symbol fields (title, ctaLabel, ctaUrl, image.url) all work. Follow-up needed to figure out the right RichText mapping shape.
- **CMA is pinned to `12.6.0-dev.4`** — this is a dev build that exposes the ExO plain client (component types, templates, data assemblies, experiences). Newer stable versions of `contentful-management` don't ship these APIs yet.
- **`/design_tokens` is called via raw `fetch()`** — the CMA dev build's plain client doesn't cover that endpoint yet, so the script talks to it directly.

# examples/scripts

One-time setup scripts for the customer-facing example apps in [`../nextjs`](../nextjs) and [`../sveltekit`](../sveltekit).

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

The demo is a `landing` Experience with one hero, two cards, and a developer-focused personalized hero variant. It provisions:

| Step | Resource type      | Count | Notes                                                                                    |
| ---- | ------------------ | ----- | ---------------------------------------------------------------------------------------- |
| 1    | ContentType        | 1     | `promotion` (title, teaser, body, ctaLabel, ctaUrl, image)                               |
| 2    | Asset              | 3     | hero background + 2 card images, read from `fixture/assets/` and uploaded to your space  |
| 3    | Entry              | 4     | Base hero + personalized hero + 2 card `promotion` entries                               |
| 4    | DesignToken        | 15    | color/size/fontSize/fontWeight tokens referenced by Components                           |
| 5    | Component          | 8     | Section, Heading, RichText, Text, Button, Image (primitives) + hero-plain + card         |
| 6    | ExperienceTemplate | 1     | `page` (passthrough)                                                                     |
| 7    | DataAssembly       | 2     | `Hero from Promotion` + `Card from Promotion` (map entry fields to Component props)      |
| 8    | (linkage)          | 2     | Append DA links to hero-plain and card Components, republish                             |
| 9    | Experience         | 1 + 3 | `landing`, its nested `Landing (developers)` variant, an EU audience and an Optimization |

Each step is idempotent: if a resource with the fixture's id already exists, that step is skipped. Re-running against a half-seeded env picks up where a previous run left off.

Step 9 also seeds the Personalization entries that activate the variant: an
`nt_audience` for EU visitors (`demo-audience-developers`) and an
`nt_experience` Optimization (`demo-optimization-developers`) that replaces the
`landing` baseline with `Landing (developers)` for that audience. Both are
rewritten on every run, so the Optimization always points at the variant's
current id. The example apps send an EU location in their page event when opened
with `?personalization=true`; without it they render the base experience.

The nested variant is idempotent too: the script finds it by its stable name,
updates it in place, and publishes the latest version.

### Fixture

The concrete data the script provisions lives in [`fixture/`](./fixture) — one TypeScript module per resource kind. If you want a different demo, edit those files rather than the bootstrap. `fixture/types.ts` documents each shape; every fixture module exports typed data the bootstrap imports directly.

### Known limitations

- **The ExO plain client methods used here (`component`, `experienceTemplate`, `dataAssembly`, `experience`) are marked `@internal` / experimental** in `contentful-management` and are subject to breaking changes without notice.
- **`/design_tokens` is called via raw `fetch()`** — the CMA dev build's plain client doesn't cover that endpoint yet. Customers setting up Experience Orchestration are encouraged to use the [Design System Import CLI tool](https://github.com/contentful/experience-design-system-sdk-public)

# @contentful/experiences-client

> ⚠️ **Internal package.** Customers do not install this directly. The framework adapter (e.g. [`@contentful/experiences-react`](../adapter-react/)) re-exports everything customers need.

Wraps the Fern-generated `@contentful/experience-delivery` client and encapsulates XDN vs. XPA endpoint selection behind a single factory.

## What lives here

- **`createExperienceClient(options)`** — factory that instantiates the correct delivery client endpoint based on `preview`. `preview: false` routes to the XDN delivery endpoint (`https://xdn.contentful.com`); `preview: true` routes to the XPA preview endpoint (`https://preview.xdn.contentful.com`).
- **`ExperienceClient`** — extends `ContentfulViewDeliveryClient` with `spaceId`, `environmentId`, and `preview`. All resources on the base class (`view`, `fragment`, etc.) are inherited automatically.

## Why a separate package?

The delivery client is a network concern, not a rendering concern. Baking it into an adapter package (e.g. `adapter-react`) would mean Svelte users pulling in a React-namespaced transitive dep to make HTTP requests, and vice versa. A standalone package keeps the dependency graph pointing in one direction: `client` → `core` → `adapter-*`.

Extending `ContentfulViewDeliveryClient` rather than wrapping it means any new top-level resource added to the Fern-generated client is available on `ExperienceClient` automatically — no manual forwarding needed.

See [`../../AGENTS.md`](../../AGENTS.md) for the full architecture and design decisions.

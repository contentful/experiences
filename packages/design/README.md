# @contentful/experiences-design

> ⚠️ **Internal package.** Customers do not install this directly. The framework adapter (e.g. [`@contentful/experiences-react`](../adapter-react/)) re-exports the utilities customers need.

Pure, framework-agnostic viewport math for resolving Contentful's `DesignPropValue` envelopes against an active viewport.

## What lives here

- **`toCssMediaQuery(viewport)`** — convert Contentful's media-query DSL (`<992px`, `>1200px`, `*`) to a CSS media query string. The wildcard and any unrecognized format return `undefined`.
- **`getViewportIndex(viewports, id?)`** — resolve a viewport id to its index in the cascade list.
- **`getValueForViewport(prop, viewports, activeIdx)`** — unwrap a `DesignPropValue`. `ManualDesignValue` → its scalar; `ValuesByViewport` → cascade-lookup at the active viewport, then unwrap; `DesignToken` → pass the envelope through (customer-resolved in v1).
- **`resolveDesignProperties(designProps, viewports, activeIdx)`** — apply `getValueForViewport` to every key of a node's design-property bag.

## Cascade behavior

Viewport order in the payload encodes cascade direction (desktop-first descending, mobile-first ascending). `getValueForViewport` walks backwards from the active viewport toward `viewports[0]`, returning the first defined value — emulating CSS cascade behavior at runtime.

See [`../../AGENTS.md`](../../AGENTS.md) for the design rationale and multi-framework story.

## License

MIT. See the repository [`LICENSE`](../../LICENSE) and [`NOTICE`](../../NOTICE) for full attribution.

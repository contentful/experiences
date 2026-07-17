# @contentful/experiences-design

> ⚠️ **Internal package.** Customers do not install this directly. The framework adapter (e.g. [`@contentful/experiences-react`](../adapter-react/)) re-exports the utilities customers need.

Pure, framework-agnostic viewport math for resolving Contentful's `DesignPropValue` envelopes against an active viewport.

## What lives here

- **`toCssMediaQuery(viewport)`** — convert Contentful's media-query DSL (`<992px`, `>1200px`, `*`) to a CSS media query string. The wildcard and any unrecognized format return `undefined`.
- **`getViewportIndex(viewports, id?)`** — resolve a viewport id to its index in the cascade list.
- **`getValueForViewport(prop, viewports, activeIdx)`** — unwrap a `DesignPropValue`. `ManualDesignValue` → its scalar; `ValuesByViewport` → cascade-lookup at the active viewport, then unwrap; `DesignToken` → pass the envelope through (customer-resolved in v1).
- **`resolveDesignProperties(designProps, viewports, activeIdx)`** — apply `getValueForViewport` to every key of a node's design-property bag.
- **`applyTokenResolver(props, resolveToken?)`** — run a resolved design record through the Config's `resolveToken`. Scalars pass through; `DesignToken` envelopes are resolved, and any that resolve to `undefined` are dropped and reported in `unresolved`. With no resolver the record is returned unchanged — and if it still contains tokens, a one-time console warning fires (they'd otherwise reach components as raw envelope objects).
- **`toCssKey(key)`** — normalize a design-record key to a candidate CSS property name: strip an optional `cf` prefix and camelCase kebab/snake (`cf-font-size` → `fontSize`).
- **`isCssProperty(key)` / `CSS_PROPERTIES`** — membership test and the underlying `Set` of CSS property names the adapters' `toCss` will emit.

## `toCss` and the CSS-property whitelist

The adapters' `toCss` helper keeps only keys whose normalized form is in `CSS_PROPERTIES` and **drops everything else** — that's how semantic design values (`variant`, `as`, `ratio`, …) stay out of a style object. The trade-off is that a genuine CSS property missing from the set is dropped silently.

If you hit that:

- **Read the value directly.** The full resolved record is available from `useDesignValues()` / `getDesignValues()`; `toCss` is only a convenience over it, so a key it drops is still readable by name.
- **Extend the set.** `CSS_PROPERTIES` is exported and mutable (`CSS_PROPERTIES.add('containerType')`) — a key added there flows through `toCss` on the next render.

The list is intentionally curated rather than exhaustive (a full CSS-property warning would misfire on the semantic keys `toCss` is meant to drop). Open a PR to add commonly-needed properties.

## Cascade behavior

Viewport order in the payload encodes cascade direction (desktop-first descending, mobile-first ascending). `getValueForViewport` walks backwards from the active viewport toward `viewports[0]`, returning the first defined value — emulating CSS cascade behavior at runtime.

See [`../../AGENTS.md`](../../AGENTS.md) for the design rationale and multi-framework story.

## License

MIT. See the repository [`LICENSE`](../../LICENSE) and [`NOTICE`](../../NOTICE) for full attribution.

# @contentful/experiences-design

> ⚠️ **Internal package.** You don't install this directly — the framework adapter (e.g. [`@contentful/experiences-react`](../adapter-react/)) re-exports the utilities you need.

Framework-agnostic helpers for turning resolved design-property records into
CSS-shaped values.

## What lives here

- **`toCssKey(key)`** — normalize a design-record key to a candidate CSS property name: strip an optional `cf` prefix and camelCase kebab/snake (`cf-font-size` → `fontSize`).
- **`isCssProperty(key)` / `CSS_PROPERTIES`** — membership test and the underlying `Set` of CSS property names the adapters' `toCss` will emit.

## `toCss` and the CSS-property whitelist

`toCss` is a companion to the design-hook escape hatch, not part of the
recommended styling path. Components should style from their auto-filled
design props, where they read the keys they declared and there is nothing to
filter — see [Styling components](../../README.md#styling-components).

The adapters' `toCss` helper keeps only keys whose normalized form is in
`CSS_PROPERTIES` and **drops everything else** — that's how semantic design
values (`variant`, `as`, `ratio`, …) stay out of a style object. The trade-off
is that a genuine CSS property missing from the set is dropped silently.

If you hit that:

- **Read the value directly.** The full resolved record is available from `useDesignValues()` / `getDesignValues()`; `toCss` is only a convenience over it, so a key it drops is still readable by name.
- **Extend the set.** `CSS_PROPERTIES` is exported and mutable (`CSS_PROPERTIES.add('containerType')`) — a key added there flows through `toCss` on the next render.

The list is intentionally curated rather than exhaustive (a full CSS-property
warning would misfire on the semantic keys `toCss` is meant to drop). Open a
PR to add commonly-needed properties.

See [`../../AGENTS.md`](../../AGENTS.md) for the design rationale and
multi-framework story.

## License

MIT. See the repository [`LICENSE`](../../LICENSE) and [`NOTICE`](../../NOTICE) for full attribution.

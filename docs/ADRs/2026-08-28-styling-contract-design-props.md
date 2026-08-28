# Styling contract: resolved design values arrive as props

- **Date:** 2026-08-28
- **Status:** Accepted
- **Ticket:** [AIS-358](https://contentful.atlassian.net/browse/AIS-358) (spike), under [AIS-336](https://contentful.atlassian.net/browse/AIS-336) ExO SDK — Core Renderer

## Context

How a customer component consumes ExO design values had drifted into three
half-supported shapes, and alpha-partner feedback flagged "how do I style a
component from design values" as under-specified. The candidates in play:

1. **Inline styles from a hook** — `useDesignValues()` + `toCss()`, historically
   the documented default.
2. **Design values as auto-filled props** — added when design resolution moved
   server-side, and already the path the README recommended.
3. **A server-generated stylesheet plus generated class names** — proposed in
   [exo-example-apps#28](https://github.com/contentful/exo-example-apps/pull/28)
   (`generateViewCss`), which was closed without landing. It kept resurfacing in
   tickets as "the incoming `createStylesheet` work", though no such code exists
   in this repo or any adjacent one.
4. **Token pass-through** — the component receives the raw
   `{ type: 'DesignToken', value: id }` envelope and resolves it itself. Raised
   by a design partner on the grounds that many design systems would rather do
   their own CSS resolution than receive resolved CSS.

Shipping all four to beta would mean documenting four contracts and supporting
four sets of bug reports, so the spike's job was to pick.

Two facts about the current implementation shaped the decision, both verified in
the code rather than assumed:

- Design resolution already happens on the server. `resolveExperience` cascades
  each node's design to the fallback viewport **and** runs `resolveToken` over it
  (`packages/core/src/resolve-experience.ts`), writing the result to
  `node.props.design` while the raw per-viewport envelopes stay on
  `node.props.designRaw`. Adapters merge that resolved bag into component props
  at `defaults < design < content < resolveData < slots`.
- A single `Config` object satisfies both the server-side `ResolverConfig` and
  the adapter `Config`, so `resolveToken` is declared once and both sides agree.

In other words, option 2 combined with `resolveToken` was already built and
already the documented recommendation. What was missing was a decision that said
so, and examples that demonstrated it.

## Decision

**Resolved design values reaching components as ordinary props is the one
recommended styling contract.** A component declares the design properties it
consumes as props and reads them by name. `resolveToken` is part of that
contract, not a parallel feature: it is what turns a token id into the value the
prop carries, so a component never sees a token envelope.

Specifically:

- **Props are first-class.** Every registered component should style from props,
  in all three adapters. In Angular, declaring the input is also what makes the
  design key arrive at all, since binding an undeclared input is an error.
- **`resolveToken` is the token seam.** Customers wire it once on `Config` to
  whatever holds their tokens — CSS custom properties, a resolved Tailwind theme,
  a DTCG package. Returning `undefined` drops the key so the component's own
  default wins.
- **The design hook is an escape hatch**, not an alternative default. It is
  supported and staying, for exactly two cases: a nested presentational child
  that isn't a registered component (nothing to auto-fill onto it), and design
  needed outside the render path (an effect, an imperative measurement).
  `toCss()` is a companion to the hook — with props you read the keys you
  declared, so there is nothing to filter.
- **Token pass-through is not a separate contract.** The partner concern it came
  from is satisfied by `resolveToken`: the customer already owns the mapping from
  token id to value, which is the control they were asking for. Omitting
  `resolveToken` while tokens are present stays a warned misconfiguration rather
  than becoming a supported mode, because a component receiving a raw envelope it
  didn't ask for is almost always a wiring mistake.
- **The SDK does not generate a stylesheet or emit class names.** Class-based and
  CSS-in-JS systems are supported as _consumers of resolved values_, which
  `resolveToken` plus props already gives them.

## Consequences

**Crossing a breakpoint costs a JS re-render.** `useActiveViewport` tracks
`matchMedia`, `selectResolvedDesign` recomputes the cascade from `designRaw` when
the active viewport differs from the fallback, and the subtree re-renders with
new props. A real stylesheet with media queries would handle resize with no JS at
all. This is the deliberate trade we are making for a single, explainable
contract, and it is worth stating plainly rather than having a partner discover
it: first paint is correct from SSR, and resize costs a render.

**Reversing course on the stylesheet path would not be cheap.** Recording what it
would take, so a future revisit starts from facts:

- `nodeId` is optional on `PortableRenderNode` (`packages/core/src/types.ts`) and
  adapters fall back to the array index. Stable class names need it required, or
  need something like PR #28's FNV-1a hash of the tree path.
- The curated `CSS_PROPERTIES` whitelist in `packages/design` would have to give
  way to a customer-supplied design-key → CSS-key map, which is what PR #28
  argued for and the opposite of what shipped.
- CSS-mapped design props would have to be withheld from components to get the
  re-render savings, changing the props contract this record just fixed.

None of that is disqualifying; it is simply more than a beta-window change.

**`toCss` stays triplicated per adapter.** React returns `CSSProperties` and
keeps any non-null value; Svelte and Angular return scalar-only plain records for
`style` strings and `[ngStyle]`. Now that `toCss` is an escape-hatch companion
rather than a recommended path, three small framework-shaped variants are an
acceptable cost, and `packages/adapter-angular/src/design-utils.ts` already
carries a comment explaining why it wasn't hoisted.

## What changed in this repo

Documentation and examples, not SDK behavior — the contract was already
implemented, so no production code changed:

- Root `README.md` states the single contract, adds an interop section for
  Tailwind / CSS-in-JS / CSS custom properties, and reframes the hook section as
  an explicit escape hatch. The Svelte and Angular walkthroughs match.
- All three example apps converted to props-first, each keeping exactly one
  deliberate escape-hatch demonstration: a nested, unregistered `CardCta` child
  that reads its parent card's design off context.
- Adapter and `packages/design` READMEs relabel the hook and `toCss` as escape
  hatches; three example READMEs that claimed "design is never injected as props"
  were simply wrong and are corrected.
- `test-apps/sveltekit/Header.svelte` deliberately keeps the hook, labeled as
  such, so that path keeps live coverage against a real space — it accepts
  whatever CSS-shaped keys the space sends without enumerating them.

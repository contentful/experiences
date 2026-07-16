/*
 * The single entry point for design in a customer component. Design values
 * are never injected as props; a component that wants to style itself calls
 * this helper at the top of its `<script>` block and applies the result
 * however it likes.
 *
 * The renderer resolves each node's design once (viewport cascade, then the
 * Config's `resolveToken`) and publishes the resulting plain-data bag on
 * context. This helper just reads it — so the resolver function lives in one
 * place (the Config) and never has to be threaded through context.
 *
 * The returned record holds ALL resolved design values: the CSS-shaped ones
 * (usually `cf`-prefixed) alongside author-defined styling like `variant`.
 * Reach for `toCss` from './design-utils' to turn the CSS-shaped keys into a
 * plain style object.
 *
 * Reactivity: the renderer stores a `$state` proxy, so the return value stays
 * current across viewport changes when you read it inside a `$derived`. Call
 * it during synchronous component initialization (top of the `<script>`
 * block) — same rule as `getExperience()`.
 */

import { getResolvedDesign } from './context.js';

/**
 * Read the current node's resolved design values. Returns `{}` when there's
 * no design in scope (for example a template with no template-level design
 * props).
 *
 * Pass a type argument to describe the shape you authored:
 *
 *   type HeadingDesign = { as?: 'h1' | 'h2'; fontSize?: string };
 *   const design = $derived(getDesignValues<HeadingDesign>());
 *   design.as; // typed
 *
 * The values are resolved at runtime from the Config's `resolveToken` and are
 * not statically verified against `T`, so this is a convenience assertion (a
 * `Partial`-style bag), not a guarantee — treat individual keys as possibly
 * `undefined`. With no type argument it falls back to
 * `Record<string, unknown>`.
 */
export function getDesignValues<T extends object = Record<string, unknown>>(): T {
  return (getResolvedDesign() ?? {}) as T;
}

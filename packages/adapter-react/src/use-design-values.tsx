/*
 * The single entry point for design in a customer component. Design values
 * are never injected as props; a component that wants to style itself calls
 * this hook at its top and applies the result however it likes.
 *
 * The renderer resolves each node's design once (viewport cascade, then the
 * Config's `resolveToken`) and publishes the resulting plain-data bag on
 * context. This hook just reads it — so the resolver function lives in one
 * place (the Config) and never has to cross the server/client boundary.
 *
 * The returned record holds ALL resolved design values: the CSS-shaped ones
 * (usually `cf`-prefixed, e.g. `cfBackgroundColor`) alongside author-defined
 * styling like `variant`. Keys come back exactly as authored — nothing is
 * renamed or reshaped. Reach for `toCss` from './design-utils' to turn the
 * CSS-shaped keys into a ready-to-spread CSSProperties object.
 */

'use client';

import { useResolvedDesign } from './context';

/**
 * Read the current node's resolved design values. Returns `{}` when there's
 * no design in scope (for example a template component with no template-level
 * design props) — never throws.
 *
 * Pass a type argument to describe the shape you authored — the same
 * ergonomics as `useState<T>()`:
 *
 *   type HeadingDesign = { as?: 'h1' | 'h2'; fontSize?: string };
 *   const design = useDesignValues<HeadingDesign>();
 *   design.as; // typed
 *
 * The values are resolved at runtime from the Config's `resolveToken` and are
 * not statically verified against `T`, so this is a convenience assertion (a
 * `Partial`-style bag), not a guarantee — treat individual keys as possibly
 * `undefined`. With no type argument it falls back to
 * `Record<string, unknown>`.
 */
export function useDesignValues<T extends object = Record<string, unknown>>(): T {
  return (useResolvedDesign() ?? {}) as T;
}

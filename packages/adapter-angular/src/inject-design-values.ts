/*
 * Port of adapter-svelte/src/get-design-values.ts.
 */

import { type Signal, computed, inject, signal } from '@angular/core';

import { DesignScope } from './node-scopes.js';

const EMPTY = signal<Record<string, unknown>>({}).asReadonly();

/**
 * Viewport-cascaded, token-resolved design values for the enclosing node.
 *
 * The renderer already assigns every design key the target component declares as
 * an input; this is for the rest — keys a component reads dynamically, or design
 * properties it never declared. Returns a signal of an empty record outside a
 * rendered node.
 *
 *   readonly design = injectDesignValues<{ cfPadding?: string }>();
 *   // template: [style.padding]="design().cfPadding"
 */
export function injectDesignValues<T extends object = Record<string, unknown>>(): Signal<T> {
  const scope = inject(DesignScope, { optional: true });
  if (!scope) return EMPTY as Signal<T>;
  return computed(() => scope.resolvedDesign() as T);
}

/*
 * React context providers + hooks for runtime escape hatches.
 *
 * The renderer no longer injects `experience` / `contentful` as props onto
 * customer components. Components stay plain React with their own prop type
 * and receive only the merged content / design / resolveData / slots prop bag.
 *
 * When a component needs the runtime context or the raw Contentful payload,
 * it calls the hook explicitly. This makes the coupling visible at the call
 * site, keeps unused-context components free of extra props, and lets generic
 * wrappers (debug overlays, analytics, theming) read the context without
 * being threaded the data manually.
 */

'use client';

import { createContext, useContext } from 'react';

import type { ContentfulComponent, ContentfulTemplate, RenderContext } from './types';

const ExperienceContext = createContext<RenderContext | null>(null);
const ContentfulComponentContext = createContext<ContentfulComponent | null>(null);
const ContentfulTemplateContext = createContext<ContentfulTemplate | null>(null);

export const ExperienceProvider = ExperienceContext.Provider;
export const ContentfulComponentProvider = ContentfulComponentContext.Provider;
export const ContentfulTemplateProvider = ContentfulTemplateContext.Provider;

/**
 * Read the current Experience runtime context — viewports, the active
 * viewport, preview flag, and free-form metadata.
 *
 * Throws when called outside any Experience renderer to surface misuse early
 * rather than silently returning null.
 */
export function useExperience(): RenderContext {
  const ctx = useContext(ExperienceContext);
  if (ctx === null) {
    throw new Error(
      'useExperience() must be called inside a <ServerExperienceRenderer> or <ClientExperienceRenderer> subtree.'
    );
  }
  return ctx;
}

/**
 * Read the raw Contentful payload for the nearest enclosing Experience node.
 * Returns `null` outside any rendered node (e.g. when called from a template's
 * chrome that wraps the nodes but isn't itself a node).
 *
 * Use for analytics keyed on `nodeId`, generic wrappers branching on
 * `componentTypeId`, custom design-prop resolution, or debug overlays.
 */
export function useContentfulComponent(): ContentfulComponent | null {
  return useContext(ContentfulComponentContext);
}

/**
 * Read the raw Contentful payload for the page-level template, if one is in
 * scope. Returns `null` outside a template's render tree.
 */
export function useContentfulTemplate(): ContentfulTemplate | null {
  return useContext(ContentfulTemplateContext);
}

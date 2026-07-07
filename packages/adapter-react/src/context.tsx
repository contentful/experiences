/*
 * React context providers + hooks that expose runtime context and the raw
 * Contentful payload to descendants of a rendered Experience. Customer
 * components receive only their declared props via the renderer; anything
 * that needs the Experience runtime context or the underlying payload calls
 * the hook explicitly at the top of its component body.
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
 * viewport, preview flag, and free-form metadata. Throws when called outside
 * any Experience renderer subtree.
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
 * Returns `null` outside any rendered node (e.g. from a template's chrome
 * that wraps the nodes but isn't itself a node).
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

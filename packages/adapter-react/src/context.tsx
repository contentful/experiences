/*
 * React context providers + hooks that expose runtime context and the raw
 * Contentful payload to descendants of a rendered Experience. Customer
 * components receive only their declared props via the renderer; anything
 * that needs the Experience runtime context or the underlying payload calls
 * the hook explicitly at the top of its component body.
 */

'use client';

import { createContext, useContext, type ReactNode } from 'react';

import type { ContentfulComponent, ContentfulExperienceTemplate, RenderContext } from './types';

const ExperienceContext = createContext<RenderContext | null>(null);
const ContentfulComponentContext = createContext<ContentfulComponent | null>(null);
const ContentfulExperienceTemplateContext = createContext<ContentfulExperienceTemplate | null>(
  null
);
// Plain data only (never the Config or its functions) so it crosses RSC cleanly.
const ResolvedDesignContext = createContext<Record<string, unknown> | null>(null);

// Wrapped as real client-component functions, not re-exported `Context.Provider`
// objects — the server renderer imports these across the RSC boundary and
// Next.js requires a function reference there ("Element type is invalid" otherwise).

export function ExperienceProvider({
  value,
  children,
}: {
  value: RenderContext;
  children: ReactNode;
}): ReactNode {
  return <ExperienceContext.Provider value={value}>{children}</ExperienceContext.Provider>;
}

export function ContentfulComponentProvider({
  value,
  children,
}: {
  value: ContentfulComponent;
  children: ReactNode;
}): ReactNode {
  return (
    <ContentfulComponentContext.Provider value={value}>
      {children}
    </ContentfulComponentContext.Provider>
  );
}

export function ContentfulExperienceTemplateProvider({
  value,
  children,
}: {
  value: ContentfulExperienceTemplate;
  children: ReactNode;
}): ReactNode {
  return (
    <ContentfulExperienceTemplateContext.Provider value={value}>
      {children}
    </ContentfulExperienceTemplateContext.Provider>
  );
}

export function ResolvedDesignProvider({
  value,
  children,
}: {
  value: Record<string, unknown>;
  children: ReactNode;
}): ReactNode {
  return <ResolvedDesignContext.Provider value={value}>{children}</ResolvedDesignContext.Provider>;
}

/**
 * Read the current Experience runtime context — viewports, the active
 * viewport, the `debug` flag, and free-form metadata. Throws when called
 * outside any Experience renderer subtree.
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
 * Read the raw Contentful payload for the page-level Experience Template, if
 * one is in scope. Returns `null` outside an Experience Template's render tree.
 */
export function useContentfulExperienceTemplate(): ContentfulExperienceTemplate | null {
  return useContext(ContentfulExperienceTemplateContext);
}

/**
 * Read the design values the renderer already resolved for the enclosing
 * node or experience template — viewport-cascaded and token-resolved, the same
 * bag that feeds the component's props. Returns `null` outside a rendered
 * node / experience template, which `useDesignValues` treats as "nothing to read."
 */
export function useResolvedDesign(): Record<string, unknown> | null {
  return useContext(ResolvedDesignContext);
}

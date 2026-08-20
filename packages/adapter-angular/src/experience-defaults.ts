/*
 * Internal defaults shared by the two experience renderers. Copied from
 * adapter-svelte/src/ServerExperienceRenderer.svelte, where they are duplicated
 * per component because Svelte has no cheap place to share them; Angular does.
 *
 * Not exported from the package: they are the shape of "no experience yet", not
 * something a customer should build on.
 */

import type { ExperienceContext, ViewportDef } from '@contentful/experiences-sdk-core';

import type { Config } from './types.js';

export const DEFAULT_CONTEXT: ExperienceContext = { debug: false, metadata: {}, viewports: [] };

/**
 * Stands in when there is no experience to read viewports from, so descendants
 * always see a viewport rather than having to branch on `undefined`. `query: '*'`
 * matches everything, mirroring what real single-viewport payloads ship today.
 */
export const FALLBACK_VIEWPORT: ViewportDef = {
  id: '_',
  query: '*',
  displayName: 'Default',
  previewSize: '100%',
};

/**
 * Read only in the window between a renderer's construction and Angular binding
 * its `config` input — the scope stores a getter, and nothing below the renderer
 * exists to call it yet. It exists so the getter's return type needs no `null`.
 */
export const EMPTY_CONFIG: Config = { components: {} };

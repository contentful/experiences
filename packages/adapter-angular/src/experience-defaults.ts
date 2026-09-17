/*
 * Internal defaults for the experience renderer.
 *
 * Not exported from the package: they are the shape of "no experience yet", not
 * something a customer should build on.
 */

import type { ExperienceContext } from '@contentful/experiences-sdk-core';

import type { Config } from './types.js';

export const DEFAULT_CONTEXT: ExperienceContext = { debug: false, metadata: {} };

/**
 * Read only in the window between a renderer's construction and Angular binding
 * its `config` input — the scope stores a getter, and nothing below the renderer
 * exists to call it yet. It exists so the getter's return type needs no `null`.
 */
export const EMPTY_CONFIG: Config = { components: {} };

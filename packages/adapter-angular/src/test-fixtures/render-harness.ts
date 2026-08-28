/*
 * The jsdom equivalent of `@testing-library/svelte`'s `render`, sized to exactly
 * what the parity suite needs. `@testing-library/angular` is not used: it pulls
 * a `@angular/*` peer graph of its own, and the adapter deliberately builds
 * against the lowest supported Angular so its partial-Ivy output stays
 * consumable on 20/21/22.
 *
 * Two things here are load-bearing:
 *
 * - `resetTestingModule()` up front. `@angular/core/testing` registers its own
 *   `beforeEach` reset, which is enough for one render per test — but three
 *   parity tests render twice inside a single `it` (null/undefined, debug on/off,
 *   missing-component on/off), and the second `configureTestingModule` would
 *   throw without an explicit reset.
 *
 * - `container` is a *detached* clone of the rendered HTML, not the live host.
 *   `querySelector`/`textContent` assertions then survive the next render's
 *   teardown, which is what lets a single `it` compare two renders.
 */

import { type Type, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';

import { ServerExperienceRendererComponent } from '../server-experience-renderer.component.js';
import type { Config } from '../types.js';

export interface RenderOptions {
  config: Config;
  initialViewportId?: string;
  metadata?: Record<string, unknown>;
  debug?: boolean;
  renderUnknown?: Type<unknown>;
  renderError?: Type<unknown>;
}

export interface RenderResult {
  /** Snapshot of the renderer's own `innerHTML`, taken before any teardown. */
  html: string;
  /** Detached element holding that snapshot — safe to query after a later render. */
  container: HTMLElement;
  /** The live host element, for assertions that need real DOM state. */
  element: HTMLElement;
}

export function render(
  experience: PortableRenderPlan | null | undefined,
  options: RenderOptions
): RenderResult {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });

  const fixture = TestBed.createComponent(ServerExperienceRendererComponent);
  const { componentRef } = fixture;

  componentRef.setInput('experience', experience);
  componentRef.setInput('config', options.config);
  // Only set the optional inputs that were actually asked for, so the
  // component's own defaults stay under test.
  if (options.initialViewportId !== undefined) {
    componentRef.setInput('initialViewportId', options.initialViewportId);
  }
  if (options.metadata !== undefined) {
    componentRef.setInput('metadata', options.metadata);
  }
  if (options.debug !== undefined) {
    componentRef.setInput('debug', options.debug);
  }
  if (options.renderUnknown !== undefined) {
    componentRef.setInput('renderUnknown', options.renderUnknown);
  }
  if (options.renderError !== undefined) {
    componentRef.setInput('renderError', options.renderError);
  }

  fixture.detectChanges();

  const element = fixture.nativeElement as HTMLElement;
  const html = element.innerHTML;
  const container = document.createElement('div');
  container.innerHTML = html;

  return { html, container, element };
}

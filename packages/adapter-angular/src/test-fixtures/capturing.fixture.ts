/*
 * Records everything the renderer handed it. Port of
 * adapter-svelte/src/test-fixtures/CapturingComponent.svelte.
 *
 * The Svelte twin captures `{ ...$props() }` — a catch-all Angular has no
 * equivalent for, and one this adapter could not honor anyway: the renderer
 * narrows the merged record to inputs the target actually declares, so an
 * undeclared key never arrives. Every key the parity suite probes is therefore
 * declared here explicitly, and `received` holds only the ones Angular set.
 *
 * `experience`, `contentful` and `children` are declared *on purpose*, even
 * though nothing should ever fill them. That turns "the adapter injects no
 * framework props" from an untestable absence into a real assertion: the
 * component offers exactly those input names and they stay unset.
 */

import { Component, Input, type OnInit } from '@angular/core';

import { injectContentfulComponent, injectExperience } from '../context.js';
import { injectDesignValues } from '../inject-design-values.js';
import { captureSink } from './capture-sink.js';

@Component({ selector: 'cf-capturing-fixture', template: '' })
export class CapturingComponent implements OnInit {
  private readonly received: Record<string, unknown> = {};

  @Input() set text(next: unknown) {
    this.received['text'] = next;
  }

  @Input() set label(next: unknown) {
    this.received['label'] = next;
  }

  @Input() set value(next: unknown) {
    this.received['value'] = next;
  }

  @Input() set variant(next: unknown) {
    this.received['variant'] = next;
  }

  @Input() set priority(next: unknown) {
    this.received['priority'] = next;
  }

  @Input() set enriched(next: unknown) {
    this.received['enriched'] = next;
  }

  @Input() set cfBackgroundColor(next: unknown) {
    this.received['cfBackgroundColor'] = next;
  }

  @Input() set cfPadding(next: unknown) {
    this.received['cfPadding'] = next;
  }

  // Declared so their absence is provable — see the docblock.
  @Input() set experience(next: unknown) {
    this.received['experience'] = next;
  }

  @Input() set contentful(next: unknown) {
    this.received['contentful'] = next;
  }

  @Input() set children(next: unknown) {
    this.received['children'] = next;
  }

  private readonly experienceContext = injectExperience();
  private readonly contentfulNode = injectContentfulComponent();
  private readonly designValues = injectDesignValues();

  /**
   * `ngOnInit`, not the constructor: inputs are bound after construction, so a
   * constructor-time snapshot would record an empty `received`. This is the
   * Angular analogue of Svelte's construction-time `$props()` read.
   */
  ngOnInit(): void {
    captureSink.push({
      props: { ...this.received },
      experience: this.experienceContext(),
      contentful: this.contentfulNode(),
      designValues: this.designValues(),
    });
  }
}

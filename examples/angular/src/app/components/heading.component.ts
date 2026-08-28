import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';

const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;
type HeadingTag = (typeof HEADING_TAGS)[number];

/**
 * The recommended way to style a component: declare the design properties you
 * consume as inputs and read them by name. They arrive resolved for the active
 * viewport, with design tokens already looked up, so there's no conversion step.
 *
 * In Angular, declaring the input is also what makes the design property arrive
 * at all — the renderer only binds inputs a component declares. Undeclared keys
 * stay reachable via `injectDesignValues()`.
 *
 * Svelte picks the tag with `<svelte:element this={tag}>`; Angular has no
 * dynamic-element primitive, so the six tags are enumerated with `@switch`.
 * `tag()` clamps to the allowed set, which is why `@default` is `<h2>`.
 */
@Component({
  selector: 'app-heading',
  imports: [NgStyle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (tag()) {
      @case ('h1') {
        <h1 [ngStyle]="style()">{{ textValue() }}</h1>
      }
      @case ('h3') {
        <h3 [ngStyle]="style()">{{ textValue() }}</h3>
      }
      @case ('h4') {
        <h4 [ngStyle]="style()">{{ textValue() }}</h4>
      }
      @case ('h5') {
        <h5 [ngStyle]="style()">{{ textValue() }}</h5>
      }
      @case ('h6') {
        <h6 [ngStyle]="style()">{{ textValue() }}</h6>
      }
      @default {
        <h2 [ngStyle]="style()">{{ textValue() }}</h2>
      }
    }
  `,
})
export class HeadingComponent {
  protected readonly textValue = signal('');
  protected readonly asValue = signal<string | undefined>(undefined);
  protected readonly alignValue = signal<string | undefined>(undefined);
  protected readonly fontSizeValue = signal<string | undefined>(undefined);
  protected readonly fontWeightValue = signal<string | undefined>(undefined);

  /** Content property. */
  @Input() set text(value: string | undefined) {
    this.textValue.set(value ?? '');
  }

  /** Design property — semantic key, picks the heading tag. */
  @Input() set as(value: string | undefined) {
    this.asValue.set(value);
  }

  /** Design property — this design system's shorthand for `text-align`. */
  @Input() set align(value: string | undefined) {
    this.alignValue.set(value);
  }

  /** Design property. */
  @Input() set fontSize(value: string | undefined) {
    this.fontSizeValue.set(value);
  }

  /** Design property. */
  @Input() set fontWeight(value: string | undefined) {
    this.fontWeightValue.set(value);
  }

  protected readonly tag = computed<HeadingTag>(() => {
    const as = this.asValue();
    return HEADING_TAGS.includes(as as HeadingTag) ? (as as HeadingTag) : 'h2';
  });

  protected readonly style = computed(() => ({
    margin: '0',
    color: '#1f2937',
    ...(this.alignValue() ? { textAlign: this.alignValue() } : {}),
    ...(this.fontSizeValue() ? { fontSize: this.fontSizeValue() } : {}),
    ...(this.fontWeightValue() ? { fontWeight: this.fontWeightValue() } : {}),
  }));
}

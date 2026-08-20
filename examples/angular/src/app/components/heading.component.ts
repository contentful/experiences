import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { injectDesignValues, toCss } from '@contentful/experiences-angular';

const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;
type HeadingTag = (typeof HEADING_TAGS)[number];

interface HeadingDesign {
  as?: string;
  align?: string;
}

/**
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

  @Input() set text(value: string | undefined) {
    this.textValue.set(value ?? '');
  }

  private readonly design = injectDesignValues<HeadingDesign>();

  protected readonly tag = computed<HeadingTag>(() => {
    const as = this.design().as;
    return HEADING_TAGS.includes(as as HeadingTag) ? (as as HeadingTag) : 'h2';
  });

  protected readonly style = computed(() => {
    const design = this.design();
    return {
      margin: '0',
      color: '#1f2937',
      ...(design.align ? { textAlign: design.align } : {}),
      // `toCss` keeps only keys that normalize to real CSS properties, so
      // `as`/`align` never leak through here.
      ...toCss(design),
    };
  });
}

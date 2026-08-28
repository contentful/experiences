import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';

import { CardCtaComponent } from './card-cta.component.js';

/**
 * Content inputs, exported so `experience-config.ts` can pass them to
 * `defineComponent<CardProps>()` — which narrows both the `resolveData` return
 * type and `defaults`.
 */
export interface CardProps {
  title?: string;
  teaser?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  image?: string;
}

const BASE_STYLE: Record<string, string> = {
  display: 'flex',
  flexDirection: 'column',
  borderRadius: '0.5rem',
  overflow: 'hidden',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
};

/**
 * Compact card: image + title + teaser + CTA. Content properties come from a
 * `Card from Promotion` DataAssembly binding. The card itself styles from its
 * declared inputs, like every other component here.
 *
 * This directory's one demonstration of the `injectDesignValues()` escape hatch
 * lives in the nested `CardCtaComponent`.
 */
@Component({
  selector: 'app-card',
  imports: [NgStyle, CardCtaComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article [ngStyle]="style()">
      @if (imageValue()) {
        <img [src]="imageValue()" alt="" style="width: 100%; height: 180px; object-fit: cover;" />
      }
      <div
        style="padding: 1rem 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; flex: 1;"
      >
        @if (titleValue()) {
          <h3 style="margin: 0; font-size: 1.25rem;">{{ titleValue() }}</h3>
        }
        @if (teaserValue()) {
          <p style="margin: 0; line-height: 1.5;">{{ teaserValue() }}</p>
        }
        @if (ctaLabelValue() && ctaUrlValue()) {
          <app-card-cta [label]="ctaLabelValue()" [url]="ctaUrlValue()" />
        }
      </div>
    </article>
  `,
})
export class CardComponent {
  protected readonly titleValue = signal<string | undefined>(undefined);
  protected readonly teaserValue = signal<string | undefined>(undefined);
  protected readonly ctaLabelValue = signal<string | undefined>(undefined);
  protected readonly ctaUrlValue = signal<string | undefined>(undefined);
  protected readonly imageValue = signal<string | undefined>(undefined);
  protected readonly backgroundColorValue = signal<string | undefined>(undefined);
  protected readonly colorValue = signal<string | undefined>(undefined);

  @Input() set title(value: string | undefined) {
    this.titleValue.set(value);
  }

  @Input() set teaser(value: string | undefined) {
    this.teaserValue.set(value);
  }

  @Input() set ctaLabel(value: string | undefined) {
    this.ctaLabelValue.set(value);
  }

  @Input() set ctaUrl(value: string | undefined) {
    this.ctaUrlValue.set(value);
  }

  @Input() set image(value: string | undefined) {
    this.imageValue.set(value);
  }

  /** Design property. */
  @Input() set backgroundColor(value: string | undefined) {
    this.backgroundColorValue.set(value);
  }

  /** Design property. */
  @Input() set color(value: string | undefined) {
    this.colorValue.set(value);
  }

  protected readonly style = computed(() => ({
    ...BASE_STYLE,
    ...(this.backgroundColorValue() ? { background: this.backgroundColorValue() } : {}),
    ...(this.colorValue() ? { color: this.colorValue() } : {}),
  }));
}

import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { injectDesignValues } from '@contentful/experiences-angular';

interface CardDesign {
  backgroundColor?: string;
  color?: string;
}

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
 * `Card from Promotion` DataAssembly binding.
 */
@Component({
  selector: 'app-card',
  imports: [NgStyle],
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
          <a
            [href]="ctaUrlValue()"
            style="margin-top: auto; display: inline-block; padding: 0.5rem 1rem; background: #111; color: #fff; text-decoration: none; border-radius: 0.25rem; align-self: flex-start;"
          >
            {{ ctaLabelValue() }}
          </a>
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

  private readonly design = injectDesignValues<CardDesign>();

  protected readonly style = computed(() => {
    const design = this.design();
    return {
      ...BASE_STYLE,
      ...(design.backgroundColor ? { background: design.backgroundColor } : {}),
      ...(design.color ? { color: design.color } : {}),
    };
  });
}

import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';

/**
 * Composed hero: title + CTA + hero image. All content properties come from a
 * `Hero from Promotion` DataAssembly binding — this component just lays them out
 * and declares its two design properties as inputs.
 */
@Component({
  selector: 'app-hero-plain',
  imports: [NgStyle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section [ngStyle]="style()">
      <div>
        @if (titleValue()) {
          <h1 style="margin: 0; font-size: 2.5rem;">{{ titleValue() }}</h1>
        }
        @if (ctaLabelValue() && ctaUrlValue()) {
          <a
            [href]="ctaUrlValue()"
            style="display: inline-block; margin-top: 1.5rem; padding: 0.75rem 1.5rem; background: #111; color: #fff; text-decoration: none; border-radius: 0.25rem;"
          >
            {{ ctaLabelValue() }}
          </a>
        }
      </div>
      @if (imageValue()) {
        <img
          [src]="imageValue()"
          alt=""
          style="max-width: 100%; height: auto; border-radius: 0.5rem;"
        />
      }
    </section>
  `,
})
export class HeroPlainComponent {
  protected readonly titleValue = signal<string | undefined>(undefined);
  protected readonly ctaLabelValue = signal<string | undefined>(undefined);
  protected readonly ctaUrlValue = signal<string | undefined>(undefined);
  protected readonly imageValue = signal<string | undefined>(undefined);
  protected readonly backgroundColorValue = signal<string | undefined>(undefined);
  protected readonly colorValue = signal<string | undefined>(undefined);

  @Input() set title(value: string | undefined) {
    this.titleValue.set(value);
  }

  /**
   * Declared so the renderer's input filter passes it through, even though the
   * layout ignores it — mirrors the Svelte example.
   */
  @Input() body: unknown;

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
    display: 'grid',
    gridTemplateColumns: this.imageValue() ? '1fr 1fr' : '1fr',
    alignItems: 'center',
    gap: '2rem',
    padding: '4rem 2rem',
    ...(this.backgroundColorValue() ? { background: this.backgroundColorValue() } : {}),
    ...(this.colorValue() ? { color: this.colorValue() } : {}),
  }));
}

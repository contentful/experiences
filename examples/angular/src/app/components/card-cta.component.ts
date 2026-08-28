import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { injectDesignValues } from '@contentful/experiences-angular';

/**
 * The escape hatch, and the one case inputs can't cover: `CardCtaComponent` is a
 * nested presentational child, not a registered component, so the SDK has no
 * inputs to auto-fill onto it. `injectDesignValues()` resolves through the
 * element-injector walk-up to the nearest registered ancestor (the card), which
 * lets the CTA tint itself with the card's own `color` without the card
 * threading it down by hand.
 *
 * Reach for this only here or when you need design outside the render path.
 * Registered components should style from their declared inputs — see every
 * other component in this directory.
 */
@Component({
  selector: 'app-card-cta',
  imports: [NgStyle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<a [href]="urlValue()" [ngStyle]="style()">{{ labelValue() }}</a>`,
})
export class CardCtaComponent {
  protected readonly labelValue = signal('');
  protected readonly urlValue = signal<string | undefined>(undefined);

  @Input() set label(value: string | undefined) {
    this.labelValue.set(value ?? '');
  }

  @Input() set url(value: string | undefined) {
    this.urlValue.set(value);
  }

  private readonly design = injectDesignValues<{ color?: string }>();

  protected readonly style = computed(() => ({
    marginTop: 'auto',
    display: 'inline-block',
    padding: '0.5rem 1rem',
    background: this.design().color ?? '#111',
    color: '#fff',
    textDecoration: 'none',
    borderRadius: '0.25rem',
    alignSelf: 'flex-start',
  }));
}

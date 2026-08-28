import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';

@Component({
  selector: 'app-text',
  imports: [NgStyle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p [ngStyle]="style()">{{ textValue() }}</p>`,
})
export class TextComponent {
  protected readonly textValue = signal('');
  protected readonly alignValue = signal<string | undefined>(undefined);
  protected readonly fontSizeValue = signal<string | undefined>(undefined);

  /** Content property. */
  @Input() set text(value: string | undefined) {
    this.textValue.set(value ?? '');
  }

  /** Design property — this design system's shorthand for `text-align`. */
  @Input() set align(value: string | undefined) {
    this.alignValue.set(value);
  }

  /** Design property. */
  @Input() set fontSize(value: string | undefined) {
    this.fontSizeValue.set(value);
  }

  protected readonly style = computed(() => ({
    fontSize: this.fontSizeValue() ?? '16px',
    lineHeight: '1.5',
    color: '#4b5563',
    margin: '0',
    ...(this.alignValue() ? { textAlign: this.alignValue() } : {}),
  }));
}

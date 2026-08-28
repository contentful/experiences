import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';

const BASE_STYLE: Record<string, string> = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '0.75rem 1.5rem',
  borderRadius: '0.25rem',
  textDecoration: 'none',
  fontWeight: '500',
  cursor: 'pointer',
};

@Component({
  selector: 'app-button',
  imports: [NgStyle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (urlValue()) {
      <a
        [href]="urlValue()"
        [ngStyle]="style()"
        [attr.target]="targetValue() ?? '_self'"
        rel="noopener noreferrer"
        >{{ labelValue() }}</a
      >
    } @else {
      <button type="button" [ngStyle]="style()">{{ labelValue() }}</button>
    }
  `,
})
export class ButtonComponent {
  protected readonly labelValue = signal('Button');
  protected readonly urlValue = signal<string | undefined>(undefined);
  protected readonly targetValue = signal<string | undefined>(undefined);
  protected readonly backgroundColorValue = signal<string | undefined>(undefined);
  protected readonly colorValue = signal<string | undefined>(undefined);

  /** Content property. */
  @Input() set label(value: string | undefined) {
    this.labelValue.set(value ?? 'Button');
  }

  /** Content property. */
  @Input() set url(value: string | undefined) {
    this.urlValue.set(value);
  }

  /** Design property — semantic key, shapes the markup rather than the CSS. */
  @Input() set target(value: string | undefined) {
    this.targetValue.set(value);
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
    background: this.backgroundColorValue() ?? '#111',
    color: this.colorValue() ?? '#fff',
  }));
}

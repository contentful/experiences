import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { injectDesignValues } from '@contentful/experiences-angular';

/**
 * Design keys this component reads dynamically. Declaring the shape keeps dot
 * access working under `noPropertyAccessFromIndexSignature`.
 */
interface ButtonDesign {
  backgroundColor?: string;
  color?: string;
  target?: string;
}

const BASE_STYLE: Record<string, string> = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '0.75rem 1.5rem',
  borderRadius: '0.25rem',
  background: '#111',
  color: '#fff',
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
        [attr.target]="target()"
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

  /** Content property. */
  @Input() set label(value: string | undefined) {
    this.labelValue.set(value ?? 'Button');
  }

  /** Content property. */
  @Input() set url(value: string | undefined) {
    this.urlValue.set(value);
  }

  private readonly design = injectDesignValues<ButtonDesign>();

  protected readonly target = computed(() => this.design().target ?? '_self');

  protected readonly style = computed(() => {
    const design = this.design();
    return {
      ...BASE_STYLE,
      ...(design.backgroundColor ? { background: design.backgroundColor } : {}),
      ...(design.color ? { color: design.color } : {}),
    };
  });
}

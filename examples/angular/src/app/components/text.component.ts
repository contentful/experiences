import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { injectDesignValues, toCss } from '@contentful/experiences-angular';

interface TextDesign {
  align?: string;
}

@Component({
  selector: 'app-text',
  imports: [NgStyle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p [ngStyle]="style()">{{ textValue() }}</p>`,
})
export class TextComponent {
  protected readonly textValue = signal('');

  @Input() set text(value: string | undefined) {
    this.textValue.set(value ?? '');
  }

  private readonly design = injectDesignValues<TextDesign>();

  protected readonly style = computed(() => {
    const design = this.design();
    return {
      fontSize: '16px',
      lineHeight: '1.5',
      color: '#4b5563',
      margin: '0',
      ...(design.align ? { textAlign: design.align } : {}),
      ...toCss(design),
    };
  });
}

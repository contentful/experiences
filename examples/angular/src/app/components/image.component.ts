import { ChangeDetectionStrategy, Component, Input, signal } from '@angular/core';
import { injectContentfulComponent } from '@contentful/experiences-angular';

@Component({
  selector: 'app-image',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (srcValue()) {
      <img
        [attr.data-cf-node-id]="contentfulComponent()?.nodeId"
        [src]="srcValue()"
        [alt]="altValue()"
        style="max-width: 100%; height: auto; display: block;"
      />
    }
  `,
})
export class ImageComponent {
  protected readonly contentfulComponent = injectContentfulComponent();
  protected readonly srcValue = signal<string | undefined>(undefined);
  protected readonly altValue = signal('');

  @Input() set src(value: string | undefined) {
    this.srcValue.set(value);
  }

  @Input() set alt(value: string | undefined) {
    this.altValue.set(value ?? '');
  }
}

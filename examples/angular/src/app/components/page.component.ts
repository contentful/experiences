import { ChangeDetectionStrategy, Component, Input, signal } from '@angular/core';
import { NodesRenderer, type PortableRenderNode } from '@contentful/experiences-angular';

/**
 * Coded Experience Template — an ordinary node in the experience. Its slots
 * arrive as inputs named after the slot, so the payload's `content` slot lands
 * on a `content` input; there is no `children` special case.
 */
@Component({
  selector: 'app-page',
  imports: [NodesRenderer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main style="display: flex; flex-direction: column; gap: 16px;">
      @if (titleValue()) {
        <p
          style="max-width: 720px; margin: 40px auto 0; padding: 0 32px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280;"
        >
          {{ titleValue() }}
        </p>
      }
      <ng-container *cfNodes="contentValue()"></ng-container>
    </main>
  `,
})
export class PageComponent {
  protected readonly titleValue = signal<string | undefined>(undefined);
  protected readonly contentValue = signal<PortableRenderNode[]>([]);

  @Input() set title(value: string | undefined) {
    this.titleValue.set(value);
  }

  /** Slot input — the template's `content` slot. */
  @Input() set content(value: PortableRenderNode[] | undefined) {
    this.contentValue.set(value ?? []);
  }
}

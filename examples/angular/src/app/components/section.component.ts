import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import {
  NodesRendererComponent,
  injectDesignValues,
  type PortableRenderNode,
} from '@contentful/experiences-angular';

interface SectionDesign {
  direction?: 'row' | 'column';
  columns?: string;
  gap?: string;
  verticalSpacing?: string;
  horizontalSpacing?: string;
  backgroundColor?: string;
  color?: string;
}

/**
 * Structural container. The payload's `children` slot lands on a `children`
 * input as `PortableRenderNode[]`; `<cf-nodes>` renders it. Nothing is
 * instantiated until that binding is evaluated, so unrendered slots stay free.
 */
@Component({
  selector: 'app-section',
  imports: [NgStyle, NodesRendererComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [ngStyle]="style()">
      <cf-nodes [nodes]="childrenValue()" />
    </div>
  `,
})
export class SectionComponent {
  protected readonly childrenValue = signal<PortableRenderNode[]>([]);

  /** Slot input — named after the slot in the payload. */
  @Input() set children(value: PortableRenderNode[] | undefined) {
    this.childrenValue.set(value ?? []);
  }

  private readonly design = injectDesignValues<SectionDesign>();

  protected readonly style = computed(() => {
    const design = this.design();
    const direction = design.direction ?? 'column';
    const columns = design.columns;
    const layout: Record<string, string> = {};

    if (columns && columns !== 'auto') {
      const tracks = `repeat(${columns}, minmax(0, 1fr))`;
      layout['display'] = 'grid';
      if (direction === 'column') {
        layout['gridTemplateRows'] = tracks;
      } else {
        layout['gridTemplateColumns'] = tracks;
      }
    } else {
      layout['display'] = 'flex';
      layout['flexDirection'] = direction;
    }

    return {
      ...layout,
      ...(design.gap ? { gap: design.gap } : {}),
      ...(design.verticalSpacing ? { paddingBlock: design.verticalSpacing } : {}),
      ...(design.horizontalSpacing ? { paddingInline: design.horizontalSpacing } : {}),
      ...(design.backgroundColor ? { background: design.backgroundColor } : {}),
      ...(design.color ? { color: design.color } : {}),
    };
  });
}

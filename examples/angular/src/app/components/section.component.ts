import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { NodesRenderer, type PortableRenderNode } from '@contentful/experiences-angular';

/**
 * Structural container. The payload's `children` slot lands on a `children`
 * input as `PortableRenderNode[]`; `*cfNodes` renders it. Nothing is
 * instantiated until that binding is evaluated, so unrendered slots stay free.
 *
 * `*cfNodes` is a structural directive, so the children land as direct children
 * of the `<div>`: the grid tracks and `gap` below apply to them, not to a
 * wrapper.
 *
 * Design properties arrive as inputs, declared by name below — `direction` and
 * `columns` are semantic keys this component maps onto flex/grid itself, the
 * rest are CSS-shaped.
 */
@Component({
  selector: 'app-section',
  imports: [NgStyle, NodesRenderer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [ngStyle]="style()">
      <ng-container *cfNodes="childrenValue()"></ng-container>
    </div>
  `,
})
export class SectionComponent {
  protected readonly childrenValue = signal<PortableRenderNode[]>([]);
  protected readonly directionValue = signal<'row' | 'column' | undefined>(undefined);
  protected readonly columnsValue = signal<string | undefined>(undefined);
  protected readonly gapValue = signal<string | undefined>(undefined);
  protected readonly verticalSpacingValue = signal<string | undefined>(undefined);
  protected readonly horizontalSpacingValue = signal<string | undefined>(undefined);
  protected readonly backgroundColorValue = signal<string | undefined>(undefined);
  protected readonly colorValue = signal<string | undefined>(undefined);

  /** Slot input — named after the slot in the payload. */
  @Input() set children(value: PortableRenderNode[] | undefined) {
    this.childrenValue.set(value ?? []);
  }

  /** Design property — semantic key, drives flex direction / grid axis. */
  @Input() set direction(value: 'row' | 'column' | undefined) {
    this.directionValue.set(value);
  }

  /** Design property — semantic key, `auto` or a track count. */
  @Input() set columns(value: string | undefined) {
    this.columnsValue.set(value);
  }

  /** Design property. */
  @Input() set gap(value: string | undefined) {
    this.gapValue.set(value);
  }

  /** Design property. */
  @Input() set verticalSpacing(value: string | undefined) {
    this.verticalSpacingValue.set(value);
  }

  /** Design property. */
  @Input() set horizontalSpacing(value: string | undefined) {
    this.horizontalSpacingValue.set(value);
  }

  /** Design property. */
  @Input() set backgroundColor(value: string | undefined) {
    this.backgroundColorValue.set(value);
  }

  /** Design property. */
  @Input() set color(value: string | undefined) {
    this.colorValue.set(value);
  }

  protected readonly style = computed(() => {
    const direction = this.directionValue() ?? 'column';
    const columns = this.columnsValue();
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
      ...(this.gapValue() ? { gap: this.gapValue() } : {}),
      ...(this.verticalSpacingValue() ? { paddingBlock: this.verticalSpacingValue() } : {}),
      ...(this.horizontalSpacingValue() ? { paddingInline: this.horizontalSpacingValue() } : {}),
      ...(this.backgroundColorValue() ? { background: this.backgroundColorValue() } : {}),
      ...(this.colorValue() ? { color: this.colorValue() } : {}),
    };
  });
}

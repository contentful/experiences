import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';

/**
 * Flips `?personalization=true` on the current URL. The Express layer reads that
 * flag and sends an EU page event with the fetch, so this is a full page load:
 * client-side navigation would not refetch the Experience.
 */
@Component({
  selector: 'app-personalization-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label
      style="position: fixed; top: 12px; right: 12px; z-index: 10; display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; color: #374151; font-size: 14px;"
    >
      <input type="checkbox" [checked]="enabled" (change)="toggle($any($event.target).checked)" />
      Personalization (simulates an EU visitor)
    </label>
  `,
})
export class PersonalizationToggleComponent {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);

  protected readonly enabled = ['true', '1'].includes(
    String(this.router.parseUrl(this.router.url).queryParams['personalization'] ?? '')
  );

  protected toggle(next: boolean): void {
    const url = new URL(this.document.location.href);
    if (next) url.searchParams.set('personalization', 'true');
    else url.searchParams.delete('personalization');
    this.document.location.assign(url.toString());
  }
}
